// Phase A.4 (mobile parity): inline confirmation card for AI-driven
// destructive tool calls.
//
// When Claude invokes one of the gated tools (delete_note,
// delete_folder, update_note_content, rename_note, rename_folder,
// rename_tag), the SSE stream emits a `confirmation` event with a
// PendingConfirmation payload. The chat panel renders this card
// inline; on Apply it re-runs the tool server-side via /ai/tools/
// confirm; on Discard it just flips the card to a "discarded" state.
//
// Mirrors `packages/ns-{web,desktop}/src/components/ConfirmationCard.tsx`
// in spirit — same status state machine, same headline / body
// strings — but trims the desktop-only diff modal (mobile shows a
// compact +/- char-delta hint instead) and uses RN primitives.

import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "@/theme/colors";
import { spacing } from "@/theme";
import type {
  ConfirmationPreview,
  PendingConfirmation,
} from "@/api/ai";

export type ConfirmationStatus =
  | "pending"
  | "applying"
  | "applied"
  | "discarded"
  | "failed";

interface Props {
  pending: PendingConfirmation;
  status: ConfirmationStatus;
  resultText?: string;
  errorMessage?: string;
  onApply: () => void;
  onDiscard: () => void;
}

/** Visible for unit-testing. */
export function headlineForPreview(preview: ConfirmationPreview): string {
  switch (preview.type) {
    case "delete_note": return "Move note to trash?";
    case "delete_folder": return "Delete folder?";
    case "update_note_content": return "Rewrite note content?";
    case "rename_note": return "Rename note?";
    case "rename_folder": return "Rename folder?";
    case "rename_tag": return "Rename tag?";
  }
}

export interface BodyLine {
  text: string;
  emphasized?: string;
  detail?: string;
}

/** Visible for unit-testing. */
export function bodyForPreview(preview: ConfirmationPreview): BodyLine {
  switch (preview.type) {
    case "delete_note":
      return {
        text: "",
        emphasized: `"${preview.title}"`,
        detail: preview.folder
          ? ` in ${preview.folder} will be moved to Trash.`
          : " will be moved to Trash.",
      };
    case "delete_folder":
      return {
        text: "",
        emphasized: `"${preview.folderName}"`,
        detail:
          preview.affectedCount === 0
            ? " (empty) will be deleted."
            : ` will be deleted. ${preview.affectedCount} note${preview.affectedCount === 1 ? "" : "s"} inside will become Unfiled (the notes themselves are kept).`,
      };
    case "update_note_content": {
      const delta = preview.newLen - preview.oldLen;
      const sign = delta >= 0 ? "+" : "";
      return {
        text: "Content of ",
        emphasized: `"${preview.title}"`,
        detail: ` will be replaced (${sign}${delta} chars, ${preview.oldLen} → ${preview.newLen}). The previous version is saved in version history.`,
      };
    }
    case "rename_note":
      return {
        text: "Rename note ",
        emphasized: `"${preview.oldTitle}"`,
        detail: ` → "${preview.newTitle}"${preview.folder ? ` in ${preview.folder}` : ""}.`,
      };
    case "rename_folder":
      return {
        text: "Rename ",
        emphasized: `"${preview.oldName}"`,
        detail: ` → "${preview.newName}".`,
      };
    case "rename_tag":
      return {
        text: "Rename tag ",
        emphasized: `#${preview.oldName}`,
        detail: ` → #${preview.newName} across ${preview.affectedCount} note${preview.affectedCount === 1 ? "" : "s"}.`,
      };
  }
}

export function ConfirmationCard({
  pending,
  status,
  resultText,
  errorMessage,
  onApply,
  onDiscard,
}: Props) {
  const themeColors = useThemeColors();
  const lines = bodyForPreview(pending.preview);

  if (status === "applied") {
    return (
      <View
        testID="confirmation-applied"
        style={[
          styles.banner,
          {
            backgroundColor: themeColors.card,
            borderColor: themeColors.success,
          },
        ]}
      >
        <Text style={[styles.bannerText, { color: themeColors.success }]}>
          {resultText ?? "Done."}
        </Text>
      </View>
    );
  }

  if (status === "discarded") {
    return (
      <View
        testID="confirmation-discarded"
        style={[
          styles.banner,
          {
            backgroundColor: themeColors.card,
            borderColor: themeColors.border,
          },
        ]}
      >
        <Text style={[styles.bannerText, { color: themeColors.muted }]}>
          Discarded.
        </Text>
      </View>
    );
  }

  if (status === "failed") {
    return (
      <View
        testID="confirmation-failed"
        style={[
          styles.banner,
          {
            backgroundColor: themeColors.card,
            borderColor: themeColors.destructive,
          },
        ]}
      >
        <Text
          style={[styles.bannerTitle, { color: themeColors.destructive }]}
        >
          Couldn&apos;t apply the change
        </Text>
        {errorMessage && (
          <Text style={[styles.bannerText, { color: themeColors.muted }]}>
            {errorMessage}
          </Text>
        )}
        <View style={styles.actionRow}>
          <Pressable
            onPress={onApply}
            style={({ pressed }) => [
              styles.btn,
              {
                backgroundColor: themeColors.primary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={styles.btnText}>Retry</Text>
          </Pressable>
          <Pressable
            onPress={onDiscard}
            style={({ pressed }) => [
              styles.btnSecondary,
              {
                borderColor: themeColors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[styles.btnSecondaryText, { color: themeColors.foreground }]}
            >
              Discard
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const applying = status === "applying";

  return (
    <View
      testID="confirmation-pending"
      style={[
        styles.card,
        {
          backgroundColor: themeColors.card,
          borderColor: themeColors.border,
        },
      ]}
    >
      <Text style={[styles.headline, { color: themeColors.foreground }]}>
        {headlineForPreview(pending.preview)}
      </Text>
      <Text style={[styles.body, { color: themeColors.foreground }]}>
        {lines.text}
        {lines.emphasized && (
          <Text style={styles.emphasized}>{lines.emphasized}</Text>
        )}
        {lines.detail && <Text>{lines.detail}</Text>}
      </Text>
      <View style={styles.actionRow}>
        <Pressable
          onPress={onApply}
          disabled={applying}
          style={({ pressed }) => [
            styles.btn,
            {
              backgroundColor: themeColors.primary,
              opacity: applying || pressed ? 0.7 : 1,
            },
          ]}
        >
          {applying ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.btnText}>Apply</Text>
          )}
        </Pressable>
        <Pressable
          onPress={onDiscard}
          disabled={applying}
          style={({ pressed }) => [
            styles.btnSecondary,
            {
              borderColor: themeColors.border,
              opacity: applying || pressed ? 0.6 : 1,
            },
          ]}
        >
          <Text
            style={[styles.btnSecondaryText, { color: themeColors.foreground }]}
          >
            Discard
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Desktop's pending / applied / discarded / failed cards all use
  // `rounded-lg bg-card border p-3` with `text-xs` content. Mobile
  // mirrors that geometry: 8px radius, 12px padding, 12px text.
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: spacing.sm,
  },
  banner: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: spacing.xs,
  },
  bannerTitle: { fontSize: 12, fontWeight: "600" },
  bannerText: { fontSize: 12 },
  headline: { fontSize: 12, fontWeight: "600" },
  body: { fontSize: 12, lineHeight: 17 },
  emphasized: { fontWeight: "500" },
  actionRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  // Desktop buttons: `px-2.5 py-1 rounded-md text-[11px] font-medium`.
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "white", fontSize: 11, fontWeight: "600" },
  btnSecondary: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: { fontSize: 11, fontWeight: "500" },
});
