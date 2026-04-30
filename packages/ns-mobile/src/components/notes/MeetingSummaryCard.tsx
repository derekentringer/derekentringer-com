import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import type { RecordingSummary } from "@/store/recordingResultStore";

// Mirrors ns-web's `meeting-summary` card in
// `AIAssistantPanel.tsx`:
// - Small mic icon + 10px uppercase tracking-wide mode-specific
//   label header ("Meeting Ended" / "Lecture Ended" / "Memo
//   Saved" / "Verbatim Saved").
// - While processing: three bouncing dots + "Generating note…".
// - On completed: a bordered card-button with a doc icon + the
//   note title — same shape as the related-notes pills.
// - On failed: red error box + "Processing failed" + the error
//   message; Retry/Discard placeholders (Retry is wired to the
//   same processRecording path C.1.5 will fully build out).

const RECORDING_ENDED_LABELS: Record<RecordingSummary["mode"], string> = {
  meeting: "Meeting Ended",
  lecture: "Lecture Ended",
  memo: "Memo Saved",
  verbatim: "Verbatim Saved",
};

export interface MeetingSummaryCardProps {
  summary: RecordingSummary;
  onOpenNote: (noteId: string) => void;
}

/**
 * Three small dots bouncing in sequence — mirrors web's
 * `bounce-dot` CSS animation. Pure RN Animated, native-driver
 * friendly so the JS thread isn't paying for it.
 */
function BouncingDots({ color }: { color: string }) {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(dot, {
            toValue: -3,
            duration: 280,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(560 - i * 140),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dots]);

  return (
    <View style={styles.dotsRow}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: color, transform: [{ translateY: d }] },
          ]}
        />
      ))}
    </View>
  );
}

export function MeetingSummaryCard({
  summary,
  onOpenNote,
}: MeetingSummaryCardProps) {
  const themeColors = useThemeColors();
  const isFailed = summary.status === "failed";
  const isCompleted = summary.status === "completed" && summary.noteId;
  const isProcessing = !isFailed && !isCompleted;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: themeColors.card,
          borderColor: themeColors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <MaterialCommunityIcons
          name="microphone-outline"
          size={12}
          color={themeColors.muted}
        />
        <Text style={[styles.headerLabel, { color: themeColors.muted }]}>
          {RECORDING_ENDED_LABELS[summary.mode]}
        </Text>
      </View>

      {isFailed ? (
        <View
          style={[
            styles.errorBox,
            {
              backgroundColor: `${themeColors.destructive}14`,
              borderColor: `${themeColors.destructive}66`,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={12}
            color={themeColors.destructive}
            style={styles.errorIcon}
          />
          <View style={styles.errorTextWrap}>
            <Text
              style={[
                styles.errorTitle,
                { color: themeColors.destructive },
              ]}
            >
              Couldn&apos;t create note
            </Text>
            {summary.errorMessage ? (
              <Text
                style={[styles.errorBody, { color: themeColors.muted }]}
              >
                {summary.errorMessage}
              </Text>
            ) : null}
          </View>
        </View>
      ) : isCompleted ? (
        <Pressable
          onPress={() => onOpenNote(summary.noteId!)}
          style={({ pressed }) => [
            styles.notePill,
            {
              borderColor: pressed
                ? `${themeColors.primary}80`
                : themeColors.border,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Open note ${summary.noteTitle ?? ""}`}
        >
          <MaterialCommunityIcons
            name="file-document-outline"
            size={12}
            color={themeColors.primary}
          />
          <Text
            style={[styles.notePillText, { color: themeColors.foreground }]}
            numberOfLines={1}
          >
            {summary.noteTitle ?? "Untitled Recording"}
          </Text>
        </Pressable>
      ) : isProcessing ? (
        <View style={styles.processingRow}>
          <BouncingDots color={`${themeColors.muted}99`} />
          <Text
            style={[styles.processingText, { color: themeColors.muted }]}
          >
            Generating note…
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    marginVertical: spacing.xs,
    gap: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 16,
  },
  processingText: {
    fontSize: 12,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: 12,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  notePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  notePillText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: 8,
  },
  errorIcon: {
    marginTop: 1,
  },
  errorTextWrap: {
    flex: 1,
    gap: 2,
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  errorBody: {
    fontSize: 11,
  },
});
