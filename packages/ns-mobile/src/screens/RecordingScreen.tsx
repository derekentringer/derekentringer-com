import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AudioModule,
  IOSOutputFormat,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { DashboardStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { transcribeChunk, type AudioMode } from "@/api/ai";
import {
  buildChunkEntry,
  buildErrorChunk,
  chunkMimeForPlatform,
  type ChunkEntry,
} from "@/lib/audioChunks";

// Phase C.1.2 layers a chunked Whisper pipeline + live transcript
// on top of the C.1.1 recording shell:
// - Every CHUNK_INTERVAL_MS the chunk loop stops the recorder,
//   reads its file URI, restarts recording (to minimize the
//   inter-chunk gap), then uploads the just-captured slice to
//   /ai/transcribe-chunk in the background.
// - Returned chunk text appends to a transcript array rendered in
//   a scroll-to-bottom view between the waveform and the controls.
// - Per-chunk failures surface inline as muted "[transcription
//   failed]" entries; the recording itself continues. C.1.5 will
//   add full retry-from-saved-file on stop.

interface ModeDef {
  key: AudioMode;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}

const MODES: ModeDef[] = [
  {
    key: "memo",
    label: "Voice Memo",
    description: "Quick thought, freeform — keep most details.",
    icon: "microphone-outline",
  },
  {
    key: "meeting",
    label: "Meeting",
    description:
      "Mic-only — structured into attendees, decisions, and action items.",
    icon: "account-group-outline",
  },
  {
    key: "lecture",
    label: "Lecture",
    description: "Long-form talk — structured summary with key points.",
    icon: "school-outline",
  },
  {
    key: "verbatim",
    label: "Verbatim",
    description: "Word-for-word transcript with no AI rewriting.",
    icon: "format-quote-close",
  },
];

// iOS records 16kHz mono linear-PCM WAV (Whisper-friendly).
// Android's MediaRecorder doesn't expose a WAV PCM output format,
// so we record AAC/m4a there — Whisper accepts m4a directly.
const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  // Enable mic-level metering so `useAudioRecorderState` exposes
  // a `metering` value (in dB) that drives the live waveform.
  isMeteringEnabled: true,
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    extension: ".wav",
    outputFormat: IOSOutputFormat.LINEARPCM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

// Number of bars across the waveform strip + the polling cadence
// for `useAudioRecorderState`. 80ms ≈ 12 samples per second; with
// 40 bars we get ~3.3s of history rolling left. Tuned for "feels
// responsive" without churning JS state at 60fps.
const WAVEFORM_BARS = 40;
const METERING_INTERVAL_MS = 80;
// Map metering dB → normalized 0..1. Mic input below -60dB is
// effectively silent for this UI; above 0dB is clipped.
const SILENCE_FLOOR_DB = -60;

// 20s chunk cadence — matches desktop. Long enough that Whisper
// has useful context; short enough that the live transcript feels
// near-realtime.
const CHUNK_INTERVAL_MS = 20_000;

type Props = NativeStackScreenProps<DashboardStackParamList, "Recording">;

export function RecordingScreen({ navigation }: Props) {
  const themeColors = useThemeColors();
  const [mode, setMode] = useState<AudioMode | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, METERING_INTERVAL_MS);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);
  const pulse = useRef(new Animated.Value(0)).current;
  // Tracks whether we've explicitly stopped the recorder. Once
  // stopped, the native AudioRecorder object is released and any
  // further property access (`recorder.isRecording`, `recorder.uri`)
  // throws "Cannot use shared object that was already released".
  // The unmount cleanup checks this before touching the recorder.
  const stoppedRef = useRef(false);
  // Chunk pipeline state — see the file header comment for the
  // overall flow.
  const sessionIdRef = useRef<string | null>(null);
  const chunkIndexRef = useRef(0);
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRotatingRef = useRef(false);
  const pendingUploadsRef = useRef<Set<Promise<unknown>>>(new Set());
  const transcriptScrollRef = useRef<ScrollView>(null);
  const [transcript, setTranscript] = useState<ChunkEntry[]>([]);
  const [isFinishing, setIsFinishing] = useState(false);

  // Rolling buffer of normalized 0..1 mic levels driving the
  // waveform strip. Initialized to all-zero so the bars sit flat
  // before the first poll. New samples push to the right; the
  // oldest falls off the left, producing the scrolling effect.
  const [levels, setLevels] = useState<number[]>(() =>
    new Array(WAVEFORM_BARS).fill(0),
  );

  useEffect(() => {
    if (!recorderState.isRecording) return;
    const m = recorderState.metering;
    if (typeof m !== "number") return;
    // expo-audio reports metering in dB. Map -60..0 → 0..1, clamp.
    const normalized = Math.max(
      0,
      Math.min(1, (m - SILENCE_FLOOR_DB) / -SILENCE_FLOOR_DB),
    );
    setLevels((prev) => {
      const next = prev.slice(1);
      next.push(normalized);
      return next;
    });
  }, [recorderState.metering, recorderState.isRecording]);

  // Reset the strip when the user toggles back to the mode picker
  // or stops, so the next session starts from a flat baseline
  // instead of inheriting the previous run's tail.
  useEffect(() => {
    if (!recorderState.isRecording && !recorderState.canRecord) {
      setLevels(new Array(WAVEFORM_BARS).fill(0));
    }
  }, [recorderState.isRecording, recorderState.canRecord]);

  // Pulsing red dot while recording — visual signal that the mic
  // is hot. Loops between two opacity values via Animated.timing.
  useEffect(() => {
    if (recorderState.isRecording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(0);
    return undefined;
  }, [recorderState.isRecording, pulse]);

  // Elapsed timer is JS-driven — `useAudioRecorderState` exposes
  // `durationMillis` on iOS but not consistently on Android, and
  // we want pause to freeze the count regardless of platform.
  useEffect(() => {
    if (recorderState.isRecording) {
      startedAtRef.current = Date.now();
      elapsedTimerRef.current = setInterval(() => {
        if (startedAtRef.current !== null) {
          setElapsedMs(
            accumulatedRef.current + (Date.now() - startedAtRef.current),
          );
        }
      }, 200);
    } else {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      if (startedAtRef.current !== null) {
        accumulatedRef.current += Date.now() - startedAtRef.current;
        startedAtRef.current = null;
      }
    }
    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    };
  }, [recorderState.isRecording]);

  useEffect(() => {
    return () => {
      // Best-effort cleanup if the screen is dismissed mid-record.
      // After an explicit stop the recorder is released and any
      // property access throws — `stoppedRef` short-circuits the
      // post-stop unmount path. The try/catch is belt-and-braces
      // for the dismissed-mid-record case.
      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current);
        chunkIntervalRef.current = null;
      }
      if (stoppedRef.current) return;
      try {
        if (recorder.isRecording) {
          recorder.stop().catch(() => undefined);
        }
      } catch {
        /* recorder already released */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Chunk pipeline ─────────────────────────────────────────

  const trackUpload = useCallback((p: Promise<unknown>) => {
    pendingUploadsRef.current.add(p);
    void p.finally(() => pendingUploadsRef.current.delete(p));
  }, []);

  const uploadChunk = useCallback(
    async (uri: string, index: number) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const { mime, extension } = chunkMimeForPlatform(Platform.OS);
      try {
        const result = await transcribeChunk(
          uri,
          mime,
          extension,
          sessionId,
          index,
        );
        const entry = buildChunkEntry(result.text, index);
        if (entry) {
          setTranscript((prev) => [...prev, entry]);
        }
      } catch {
        setTranscript((prev) => [...prev, buildErrorChunk(index)]);
      } finally {
        // Best-effort cleanup of the local audio file. Sandbox
        // eviction would catch this eventually, but a long
        // recording can pile up 200+ files.
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  const rotateChunk = useCallback(async () => {
    // Re-entry guard: if a previous rotation is still in flight
    // (slow stop or slow prepare), skip this tick rather than
    // double-rotating.
    if (isRotatingRef.current) return;
    if (stoppedRef.current) return;
    if (!recorderState.isRecording) return;

    isRotatingRef.current = true;
    try {
      let uri: string | null = null;
      try {
        await recorder.stop();
        uri = recorder.uri ?? null;
      } catch {
        return;
      }
      const idx = chunkIndexRef.current;
      chunkIndexRef.current = idx + 1;

      // Restart the recorder immediately so the audio gap between
      // chunks is as close to the prepare+record latency as we
      // can get. The upload runs in the background; we don't
      // await it here.
      try {
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch {
        /* recorder restart failed — chunk loop will try again on next tick */
      }

      if (uri) {
        trackUpload(uploadChunk(uri, idx));
      }
    } finally {
      isRotatingRef.current = false;
    }
  }, [recorder, recorderState.isRecording, trackUpload, uploadChunk]);

  const startChunkLoop = useCallback(() => {
    if (chunkIntervalRef.current) return;
    chunkIntervalRef.current = setInterval(() => {
      void rotateChunk();
    }, CHUNK_INTERVAL_MS);
  }, [rotateChunk]);

  const stopChunkLoop = useCallback(() => {
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }
  }, []);

  // Auto-scroll the transcript to the bottom as new chunks land.
  useEffect(() => {
    if (transcript.length === 0) return;
    const id = setTimeout(() => {
      transcriptScrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(id);
  }, [transcript.length]);

  const requestPermission = async (): Promise<boolean> => {
    if (hasPermission === true) return true;
    const result = await AudioModule.requestRecordingPermissionsAsync();
    if (!result.granted) {
      setHasPermission(false);
      Alert.alert(
        "Microphone access required",
        "Enable microphone access in Settings to record voice memos.",
      );
      return false;
    }
    setHasPermission(true);
    return true;
  };

  const handleSelectMode = async (selected: AudioMode) => {
    const ok = await requestPermission();
    if (!ok) return;
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
    });
    await recorder.prepareToRecordAsync();
    setMode(selected);
    accumulatedRef.current = 0;
    setElapsedMs(0);
    sessionIdRef.current = Crypto.randomUUID();
    chunkIndexRef.current = 0;
    setTranscript([]);
    recorder.record();
    startChunkLoop();
  };

  const handlePauseResume = async () => {
    if (recorderState.isRecording) {
      stopChunkLoop();
      recorder.pause();
    } else if (mode) {
      recorder.record();
      startChunkLoop();
    }
  };

  const handleStop = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    stopChunkLoop();

    // Final chunk: stop the recorder and upload whatever audio
    // accumulated since the last rotation.
    let finalUri: string | null = null;
    try {
      await recorder.stop();
      finalUri = recorder.uri ?? null;
    } catch {
      /* ignore */
    }
    if (finalUri) {
      const idx = chunkIndexRef.current;
      chunkIndexRef.current = idx + 1;
      trackUpload(uploadChunk(finalUri, idx));
    }

    // Wait for every in-flight chunk upload before returning.
    // Ensures `stoppedRef` doesn't flip until uploads are done so
    // the unmount cleanup race we fixed in C.1.1 stays fixed.
    await Promise.allSettled([...pendingUploadsRef.current]);

    stoppedRef.current = true;
    // C.1.3 will route to the AI-structured review/save screen.
    navigation.goBack();
  };

  const handleCancel = async () => {
    stopChunkLoop();
    try {
      await recorder.stop();
    } catch {
      /* ignore */
    }
    // Drop in-flight uploads on the floor — this is "discard"
    // semantically. Their `.finally` will still run and clean up
    // the local files.
    stoppedRef.current = true;
    navigation.goBack();
  };

  const formatElapsed = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const mm = Math.floor(total / 60)
      .toString()
      .padStart(2, "0");
    const ss = (total % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  };

  if (!mode) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: themeColors.background },
        ]}
      >
        <Text style={[styles.heading, { color: themeColors.foreground }]}>
          Choose a mode
        </Text>
        <Text style={[styles.subheading, { color: themeColors.muted }]}>
          We&apos;ll structure the transcript differently depending on
          what you&apos;re recording.
        </Text>
        <View style={styles.modeList}>
          {MODES.map((def) => (
            <Pressable
              key={def.key}
              onPress={() => handleSelectMode(def.key)}
              style={({ pressed }) => [
                styles.modeRow,
                {
                  backgroundColor: pressed
                    ? themeColors.input
                    : themeColors.card,
                  borderColor: themeColors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Record in ${def.label} mode`}
            >
              <MaterialCommunityIcons
                name={def.icon}
                size={26}
                color={themeColors.primary}
                style={styles.modeIcon}
              />
              <View style={styles.modeText}>
                <Text
                  style={[
                    styles.modeLabel,
                    { color: themeColors.foreground },
                  ]}
                >
                  {def.label}
                </Text>
                <Text
                  style={[
                    styles.modeDescription,
                    { color: themeColors.muted },
                  ]}
                >
                  {def.description}
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={22}
                color={themeColors.muted}
              />
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  const modeDef = MODES.find((m) => m.key === mode);
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  return (
    <View
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <View style={styles.modeBadge}>
        <MaterialCommunityIcons
          name={modeDef?.icon ?? "microphone-outline"}
          size={16}
          color={themeColors.muted}
        />
        <Text style={[styles.modeBadgeText, { color: themeColors.muted }]}>
          {modeDef?.label}
        </Text>
      </View>

      <View style={styles.recordingBody}>
        <View style={styles.waveform}>
          {levels.map((level, i) => (
            <View
              key={i}
              style={[
                styles.waveformBar,
                {
                  // Floor of 3px so the bar is still a visible line
                  // when the mic is silent; max ~64px for clear
                  // peaks. Quieter colour when paused.
                  height: 3 + level * 61,
                  backgroundColor: recorderState.isRecording
                    ? themeColors.primary
                    : themeColors.muted,
                  opacity: recorderState.isRecording ? 1 : 0.4,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.statusRow}>
          <Animated.View
            style={[
              styles.recDot,
              {
                opacity: pulseOpacity,
                backgroundColor: recorderState.isRecording
                  ? themeColors.destructive
                  : themeColors.muted,
              },
            ]}
          />
          <Text style={[styles.statusLabel, { color: themeColors.muted }]}>
            {isFinishing
              ? "Finishing transcription…"
              : recorderState.isRecording
                ? "Recording"
                : "Paused"}
          </Text>
        </View>
        <Text style={[styles.elapsed, { color: themeColors.foreground }]}>
          {formatElapsed(elapsedMs)}
        </Text>

        <View
          style={[
            styles.transcriptCard,
            {
              backgroundColor: themeColors.card,
              borderColor: themeColors.border,
            },
          ]}
        >
          <Text
            style={[styles.transcriptLabel, { color: themeColors.muted }]}
          >
            Live Transcript
          </Text>
          <ScrollView
            ref={transcriptScrollRef}
            style={styles.transcriptScroll}
            contentContainerStyle={styles.transcriptContent}
            onContentSizeChange={() =>
              transcriptScrollRef.current?.scrollToEnd({ animated: true })
            }
          >
            {transcript.length === 0 ? (
              <Text
                style={[styles.transcriptHint, { color: themeColors.muted }]}
              >
                {recorderState.isRecording
                  ? "Listening…"
                  : isFinishing
                    ? "Wrapping up…"
                    : "Paused"}
              </Text>
            ) : (
              <Text
                style={[
                  styles.transcriptBody,
                  { color: themeColors.foreground },
                ]}
              >
                {transcript.map((entry, i) => (
                  <Text
                    key={`${entry.index}-${i}`}
                    style={
                      entry.status === "error"
                        ? {
                            color: themeColors.muted,
                            fontStyle: "italic",
                          }
                        : undefined
                    }
                  >
                    {entry.text}
                    {i < transcript.length - 1 ? " " : ""}
                  </Text>
                ))}
              </Text>
            )}
          </ScrollView>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={handleCancel}
          disabled={isFinishing}
          style={[
            styles.secondaryButton,
            { borderColor: themeColors.border },
            isFinishing && { opacity: 0.5 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Cancel recording"
        >
          <MaterialCommunityIcons
            name="close"
            size={22}
            color={themeColors.foreground}
          />
          <Text
            style={[styles.secondaryButtonText, { color: themeColors.foreground }]}
          >
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={handlePauseResume}
          disabled={isFinishing}
          style={[
            styles.secondaryButton,
            { borderColor: themeColors.border },
            isFinishing && { opacity: 0.5 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={recorderState.isRecording ? "Pause" : "Resume"}
        >
          <MaterialCommunityIcons
            name={recorderState.isRecording ? "pause" : "play"}
            size={22}
            color={themeColors.foreground}
          />
          <Text
            style={[styles.secondaryButtonText, { color: themeColors.foreground }]}
          >
            {recorderState.isRecording ? "Pause" : "Resume"}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleStop}
          disabled={isFinishing}
          style={[
            styles.primaryButton,
            { backgroundColor: themeColors.primary },
            isFinishing && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Stop recording"
        >
          <MaterialCommunityIcons
            name="stop"
            size={22}
            color="#0f1117"
          />
          <Text style={styles.primaryButtonText}>
            {isFinishing ? "Finishing…" : "Stop"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
  },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  subheading: {
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  modeList: {
    gap: spacing.sm,
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.md,
  },
  modeIcon: {
    width: 32,
    textAlign: "center",
  },
  modeText: {
    flex: 1,
    gap: 2,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  modeDescription: {
    fontSize: 12,
  },
  modeBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginBottom: spacing.lg,
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  recordingBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: spacing.md,
  },
  waveform: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 80,
    gap: 3,
    width: "100%",
    paddingHorizontal: spacing.md,
  },
  waveformBar: {
    flex: 1,
    minWidth: 2,
    borderRadius: 2,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  elapsed: {
    fontSize: 56,
    fontWeight: "300",
    fontVariant: ["tabular-nums"],
  },
  statusLabel: {
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  transcriptCard: {
    width: "100%",
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  transcriptLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptContent: {
    paddingBottom: spacing.xs,
  },
  transcriptBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  transcriptHint: {
    fontSize: 13,
    fontStyle: "italic",
  },
  controls: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  primaryButton: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
  },
  primaryButtonText: {
    color: "#0f1117",
    fontSize: 14,
    fontWeight: "700",
  },
});
