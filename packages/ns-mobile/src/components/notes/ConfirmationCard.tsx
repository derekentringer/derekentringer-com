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
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
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

export interface ItemResult {
  id: string;
  ok: boolean;
  text?: string;
  error?: string;
}

interface Props {
  /** One or more pending actions. Length > 1 is a batched card —
   *  e.g. Claude queued 3 deletes in one turn — and renders as a
   *  single Apply CTA with a per-item summary list. */
  pendings: PendingConfirmation[];
  status: ConfirmationStatus;
  resultText?: string;
  errorMessage?: string;
  /** Per-item Apply outcomes; only populated for batches. Surfaces
   *  partial-failure detail in the applied banner. */
  itemResults?: ItemResult[];
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

/** Visible for unit-testing. Headline for a batch of N actions of
 *  the same toolName (e.g. "Move 3 notes to trash?"). */
export function batchHeadline(toolName: string, count: number): string {
  switch (toolName) {
    case "delete_note": return `Move ${count} notes to trash?`;
    case "delete_folder": return `Delete ${count} folders?`;
    case "update_note_content": return `Rewrite ${count} notes?`;
    case "rename_note": return `Rename ${count} notes?`;
    case "rename_folder": return `Rename ${count} folders?`;
    case "rename_tag": return `Rename ${count} tags?`;
    default: return `Apply ${count} actions?`;
  }
}

/** Visible for unit-testing. One-line summary for a single item
 *  inside a batched card. */
export function batchItemSummary(preview: ConfirmationPreview): string {
  switch (preview.type) {
    case "delete_note": return preview.title;
    case "delete_folder":
      return `${preview.folderName} (${preview.affectedCount} note${preview.affectedCount === 1 ? "" : "s"})`;
    case "update_note_content": {
      const delta = preview.newLen - preview.oldLen;
      const sign = delta >= 0 ? "+" : "";
      return `${preview.title} (${sign}${delta} chars)`;
    }
    case "rename_note":
      return `${preview.oldTitle} → ${preview.newTitle}`;
    case "rename_folder":
      return `${preview.oldName} → ${preview.newName}`;
    case "rename_tag":
      return `#${preview.oldName} → #${preview.newName} (${preview.affectedCount})`;
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
  pendings,
  status,
  resultText,
  errorMessage,
  itemResults,
  onApply,
  onDiscard,
}: Props) {
  const themeColors = useThemeColors();
  const first = pendings[0];
  const isBatch = pendings.length > 1;
  if (!first) return null;
  const lines = bodyForPreview(first.preview);

  if (status === "applied") {
    const failures = itemResults?.filter((r) => !r.ok) ?? [];
    const partial = failures.length > 0;
    return (
      <View
        testID="confirmation-applied"
        style={[
          styles.banner,
          {
            backgroundColor: themeColors.card,
            borderColor: partial ? themeColors.destructive : themeColors.success,
          },
        ]}
      >
        <Text
          style={[
            styles.bannerText,
            { color: partial ? themeColors.destructive : themeColors.success },
          ]}
        >
          {partial ? "⚠" : "✓"} {resultText ?? "Done."}
        </Text>
        {partial && (
          <View style={styles.failureList}>
            {failures.map((f) => (
              <Text
                key={f.id}
                style={[styles.failureItem, { color: themeColors.muted }]}
              >
                • {f.error}
              </Text>
            ))}
          </View>
        )}
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
          // Amber border on the pending card to flag the destructive
          // intent — matches desktop's `border-amber-500/40`.
          borderColor: `${themeColors.warning}66`,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <MaterialCommunityIcons
          name="alert-outline"
          size={14}
          color={themeColors.warning}
          style={styles.warningIcon}
        />
        <View style={styles.headerBody}>
          <Text style={[styles.headline, { color: themeColors.foreground }]}>
            {isBatch
              ? batchHeadline(first.toolName, pendings.length)
              : headlineForPreview(first.preview)}
          </Text>
          {isBatch ? (
            <View style={styles.batchList}>
              {pendings.map((p) => (
                <Text
                  key={p.id}
                  style={[styles.batchItem, { color: themeColors.foreground }]}
                  numberOfLines={1}
                >
                  • {batchItemSummary(p.preview)}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={[styles.body, { color: themeColors.foreground }]}>
              {lines.text}
              {lines.emphasized && (
                <Text style={styles.emphasized}>{lines.emphasized}</Text>
              )}
              {lines.detail && <Text>{lines.detail}</Text>}
            </Text>
          )}
        </View>
      </View>
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
            <ActivityIndicator size="small" color="#000000" />
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
  // Header row — warning icon + headline/body — matches desktop's
  // `flex items-start gap-1.5 mb-2` shape on the pending card.
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  warningIcon: { marginTop: 2 },
  headerBody: { flex: 1, gap: 4 },
  banner: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: spacing.xs,
  },
  bannerTitle: { fontSize: 12, fontWeight: "600" },
  bannerText: { fontSize: 12 },
  headline: { fontSize: 12, fontWeight: "500" },
  body: { fontSize: 12, lineHeight: 17 },
  emphasized: { fontWeight: "500" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  // Mobile bumps button height up vs desktop's px-2.5 py-1 — taps
  // need a comfortable hit target. Apply text is black on the lime
  // bg (matches `text-primary-contrast`) instead of white.
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#000000", fontSize: 13, fontWeight: "500" },
  btnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: { fontSize: 13, fontWeight: "500" },
  batchList: { gap: 2 },
  batchItem: { fontSize: 12, lineHeight: 17 },
  failureList: { marginTop: spacing.xs, gap: 2 },
  failureItem: { fontSize: 11, lineHeight: 15 },
});
