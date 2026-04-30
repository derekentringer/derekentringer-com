import React, { useEffect, useRef, useState } from "react";
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
import type {
  RecordingSummary,
  RelatedNote,
} from "@/store/recordingResultStore";

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

/** Tap-to-toggle disclosure row matching web's <details>/<summary>
 *  pattern. Used by the transcript + related-notes collapsibles
 *  inside the meeting card. */
function Disclosure({
  label,
  children,
  themeColorMuted,
  themeColorForeground,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  themeColorMuted: string;
  themeColorForeground: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.disclosureSummary}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? `Collapse ${label}` : `Expand ${label}`}
      >
        <MaterialCommunityIcons
          name={open ? "chevron-down" : "chevron-right"}
          size={12}
          color={themeColorMuted}
        />
        <Text
          style={[styles.disclosureLabel, { color: themeColorMuted }]}
        >
          {label}
        </Text>
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
      {/* Suppress unused-prop warning when foreground isn't used
          inside children. */}
      {themeColorForeground ? null : null}
    </View>
  );
}

const PILL_LIMIT = 5;

function RelatedNotesList({
  notes,
  onOpenNote,
}: {
  notes: RelatedNote[];
  onOpenNote: (noteId: string) => void;
}) {
  const themeColors = useThemeColors();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? notes : notes.slice(0, PILL_LIMIT);
  const overflow = notes.length - PILL_LIMIT;
  return (
    <View style={styles.relatedList}>
      {visible.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => onOpenNote(n.id)}
          style={({ pressed }) => [
            styles.notePill,
            {
              borderColor: pressed
                ? `${themeColors.primary}80`
                : themeColors.border,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Open related note ${n.title}`}
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
            {n.title}
          </Text>
          <Text
            style={[styles.relatedScore, { color: `${themeColors.primary}B3` }]}
          >
            {Math.round(n.score * 100)}%
          </Text>
        </Pressable>
      ))}
      {!showAll && overflow > 0 ? (
        <Pressable
          onPress={() => setShowAll(true)}
          style={styles.disclosureSummary}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={12}
            color={themeColors.muted}
          />
          <Text
            style={[styles.disclosureLabel, { color: themeColors.muted }]}
          >
            Show {overflow} more
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
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

      {/* Related notes collapsible — mirrors web's PILL_LIMIT=5
          + "Show N more" pattern. Hidden when no notes were
          surfaced during recording. */}
      {summary.relatedNotes && summary.relatedNotes.length > 0 ? (
        <Disclosure
          label="Related notes"
          themeColorMuted={themeColors.muted}
          themeColorForeground={themeColors.foreground}
        >
          <RelatedNotesList
            notes={summary.relatedNotes}
            onOpenNote={onOpenNote}
          />
        </Disclosure>
      ) : null}

      {/* Transcript collapsible — same `<details>`-style pattern
          web uses, with a rough word count in the summary label. */}
      {summary.transcript && summary.transcript.trim().length > 0 ? (
        <Disclosure
          label={`View transcript (${Math.round(summary.transcript.length / 5)} words)`}
          themeColorMuted={themeColors.muted}
          themeColorForeground={themeColors.foreground}
        >
          <Text
            style={[styles.transcriptText, { color: themeColors.muted }]}
          >
            {summary.transcript}
          </Text>
        </Disclosure>
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
  disclosureSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  disclosureLabel: {
    fontSize: 10,
  },
  disclosureBody: {
    paddingTop: 4,
    paddingLeft: 16,
  },
  relatedList: {
    gap: 4,
  },
  relatedScore: {
    fontSize: 10,
    fontVariant: ["tabular-nums"],
    marginLeft: "auto",
  },
  transcriptText: {
    fontSize: 12,
    lineHeight: 18,
    maxHeight: 200,
  },
});
