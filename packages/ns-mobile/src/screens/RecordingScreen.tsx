import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Pressable,
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
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { DashboardStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import type { AudioMode } from "@/api/ai";

// Phase C.1.1 (mobile parity audio recording — foundation):
// full-screen recording surface with a mode picker on entry +
// record / pause / stop controls. The chunked Whisper pipeline
// and AI structuring on stop land in C.1.2 / C.1.3 — this slice
// just wires expo-audio, the permission flow, and the in-app
// presentation so the rest can layer on top without touching the
// shell.

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
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    extension: ".wav",
    outputFormat: IOSOutputFormat.LINEARPCM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

type Props = NativeStackScreenProps<DashboardStackParamList, "Recording">;

export function RecordingScreen({ navigation }: Props) {
  const themeColors = useThemeColors();
  const [mode, setMode] = useState<AudioMode | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);
  const pulse = useRef(new Animated.Value(0)).current;

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
      if (recorder.isRecording) {
        recorder.stop().catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    recorder.record();
  };

  const handlePauseResume = async () => {
    if (recorderState.isRecording) {
      recorder.pause();
    } else if (mode) {
      recorder.record();
    }
  };

  const handleStop = async () => {
    try {
      await recorder.stop();
    } catch {
      // ignore — fall through to cleanup
    }
    const uri = recorder.uri;
    // C.1.1 keeps the post-stop flow minimal: surface the saved
    // file path. C.1.3 will replace this with the AI-structured
    // review-and-save screen.
    Alert.alert(
      "Recording saved",
      uri ?? "No audio file was produced.",
      [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ],
    );
  };

  const handleCancel = async () => {
    if (recorderState.isRecording || recorderState.isRecording === false) {
      try {
        await recorder.stop();
      } catch {
        /* ignore */
      }
    }
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
        <Text style={[styles.elapsed, { color: themeColors.foreground }]}>
          {formatElapsed(elapsedMs)}
        </Text>
        <Text style={[styles.statusLabel, { color: themeColors.muted }]}>
          {recorderState.isRecording ? "Recording" : "Paused"}
        </Text>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={handleCancel}
          style={[styles.secondaryButton, { borderColor: themeColors.border }]}
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
          style={[styles.secondaryButton, { borderColor: themeColors.border }]}
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
          style={[
            styles.primaryButton,
            { backgroundColor: themeColors.primary },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Stop recording"
        >
          <MaterialCommunityIcons
            name="stop"
            size={22}
            color="#0f1117"
          />
          <Text style={styles.primaryButtonText}>Stop</Text>
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
    justifyContent: "center",
    gap: spacing.sm,
  },
  recDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginBottom: spacing.md,
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
