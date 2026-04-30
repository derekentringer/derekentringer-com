import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import type { RecordingSummary } from "@/store/recordingResultStore";

// Mirrors ns-web's MeetingSummary card: a compact card embedded
// in the AI chat that surfaces a recording's post-stop pipeline
// progress (transcribing → structuring → completed) and provides
// an "Open Note" button when the note has been created locally.

const MODE_LABEL: Record<RecordingSummary["mode"], string> = {
  meeting: "Meeting Recording",
  lecture: "Lecture Recording",
  memo: "Voice Memo",
  verbatim: "Verbatim Recording",
};

const MODE_ICON: Record<
  RecordingSummary["mode"],
  React.ComponentProps<typeof MaterialCommunityIcons>["name"]
> = {
  meeting: "account-group-outline",
  lecture: "school-outline",
  memo: "microphone-outline",
  verbatim: "format-quote-close",
};

export interface MeetingSummaryCardProps {
  summary: RecordingSummary;
  onOpenNote: (noteId: string) => void;
}

export function MeetingSummaryCard({
  summary,
  onOpenNote,
}: MeetingSummaryCardProps) {
  const themeColors = useThemeColors();

  const status = summary.status;
  const isProcessing = status === "transcribing" || status === "structuring";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  const statusLine = isProcessing
    ? status === "transcribing"
      ? "Transcribing audio…"
      : "Structuring with AI…"
    : isCompleted
      ? "Note ready"
      : "Couldn't create note";

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
          name={MODE_ICON[summary.mode]}
          size={18}
          color={themeColors.primary}
        />
        <Text style={[styles.title, { color: themeColors.foreground }]}>
          {MODE_LABEL[summary.mode]}
        </Text>
      </View>

      <View style={styles.statusRow}>
        {isProcessing ? (
          <ActivityIndicator size="small" color={themeColors.primary} />
        ) : isCompleted ? (
          <MaterialCommunityIcons
            name="check-circle-outline"
            size={18}
            color={themeColors.primary}
          />
        ) : (
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={18}
            color={themeColors.destructive}
          />
        )}
        <Text
          style={[
            styles.statusText,
            {
              color: isFailed
                ? themeColors.destructive
                : themeColors.foreground,
            },
          ]}
        >
          {statusLine}
        </Text>
      </View>

      {isCompleted && summary.noteTitle ? (
        <Text
          style={[styles.noteTitle, { color: themeColors.muted }]}
          numberOfLines={2}
        >
          {summary.noteTitle}
        </Text>
      ) : null}

      {isFailed && summary.errorMessage ? (
        <Text
          style={[styles.errorText, { color: themeColors.muted }]}
          numberOfLines={3}
        >
          {summary.errorMessage}
        </Text>
      ) : null}

      {!isCompleted && summary.transcript ? (
        <Text
          style={[styles.transcriptPreview, { color: themeColors.muted }]}
          numberOfLines={3}
        >
          {summary.transcript}
        </Text>
      ) : null}

      {isCompleted && summary.noteId ? (
        <Pressable
          onPress={() => onOpenNote(summary.noteId!)}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: themeColors.primary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open the new note"
        >
          <MaterialCommunityIcons
            name="note-text-outline"
            size={18}
            color="#0f1117"
          />
          <Text style={styles.buttonText}>Open Note</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  statusText: {
    fontSize: 13,
  },
  noteTitle: {
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 2,
  },
  errorText: {
    fontSize: 12,
    marginTop: 2,
  },
  transcriptPreview: {
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 4,
    lineHeight: 16,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: borderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: spacing.xs,
  },
  buttonText: {
    color: "#0f1117",
    fontWeight: "700",
    fontSize: 14,
  },
});
