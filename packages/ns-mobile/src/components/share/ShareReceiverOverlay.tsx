import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useShareIntentContext } from "expo-share-intent";
import type { LinkPreview, Note } from "@derekentringer/ns-shared";
import { useCreateNote, useUpdateNote } from "@/hooks/useNotes";
import { useThemeColors } from "@/theme/colors";
import { borderRadius, spacing } from "@/theme";
import { appendShareContent } from "@/lib/appendShareContent";
import {
  deriveLinkPreviewTitle,
  detectSharedUrl,
  formatLinkPreviewBody,
} from "@/lib/linkPreviewMarkdown";
import { fetchLinkPreview } from "@/api/links";
import { AppendTargetSheet } from "./AppendTargetSheet";

/**
 * Phase E.1–E.4 — Share-sheet receiver. When the user shares text
 * or a URL from another app, this overlay renders on top of the
 * tab navigator and offers Save-new / Append-to-existing actions.
 *
 * Phase E.4 adds URL enrichment: when the shared payload is a
 * single URL, we call /links/preview to grab the page's title +
 * description + og:image (re-hosted to our R2 CDN, not hotlinked
 * to the publisher) and render an enriched preview card. The user
 * can dismiss the metadata via an X chip and save just the bare
 * URL instead.
 */
type PreviewState = "idle" | "loading" | "loaded" | "failed";

export function ShareReceiverOverlay() {
  const ctx = useShareIntentContext();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const appendSheetRef = useRef<BottomSheetModal>(null);
  const [pending, setPending] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const [enrichmentEnabled, setEnrichmentEnabled] = useState(true);

  const sharedText = ctx.shareIntent?.text ?? "";
  const sharedWebUrl = ctx.shareIntent?.webUrl ?? "";
  const sharedUrl = useMemo(
    () => detectSharedUrl(sharedText, sharedWebUrl),
    [sharedText, sharedWebUrl],
  );
  const fallbackPreviewText =
    sharedText.length > 0 ? sharedText : sharedWebUrl;

  // Title / body the underlying mutations should send. URL shares
  // get the enriched title + markdown body when the user hasn't
  // dismissed the metadata; non-URL shares fall back to the
  // first-non-empty-line title and raw shared text.
  const isEnrichedUrlShare =
    sharedUrl !== null &&
    enrichmentEnabled &&
    previewState === "loaded" &&
    linkPreview !== null;

  const saveTitle = useMemo(() => {
    if (sharedUrl !== null && linkPreview !== null) {
      return deriveLinkPreviewTitle(linkPreview, isEnrichedUrlShare);
    }
    if (sharedUrl !== null) return sharedUrl;
    const firstLine = fallbackPreviewText
      .split("\n")
      .find((l) => l.trim().length > 0);
    if (!firstLine) return "Shared note";
    const trimmed = firstLine.trim();
    return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  }, [sharedUrl, linkPreview, isEnrichedUrlShare, fallbackPreviewText]);

  const saveBody = useMemo(() => {
    if (sharedUrl !== null && linkPreview !== null) {
      return formatLinkPreviewBody(linkPreview, isEnrichedUrlShare);
    }
    if (sharedUrl !== null) return sharedUrl;
    return fallbackPreviewText;
  }, [sharedUrl, linkPreview, isEnrichedUrlShare, fallbackPreviewText]);

  const dismiss = useCallback(() => {
    // `true` clears the native module's queued payload so a
    // subsequent share fires fresh.
    ctx.resetShareIntent(true);
  }, [ctx]);

  const handleSave = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      await createNote.mutateAsync({
        title: saveTitle,
        content: saveBody,
      });
      dismiss();
    } catch {
      setPending(false);
    }
  }, [pending, createNote, saveTitle, saveBody, dismiss]);

  const handleOpenAppendPicker = useCallback(() => {
    if (pending) return;
    appendSheetRef.current?.present();
  }, [pending]);

  const handleAppendToNote = useCallback(
    async (target: Note) => {
      if (pending) return;
      setPending(true);
      try {
        const newContent = appendShareContent(
          target.content ?? "",
          saveBody,
          new Date(),
        );
        await updateNote.mutateAsync({
          id: target.id,
          data: { content: newContent },
        });
        dismiss();
      } catch {
        setPending(false);
      }
    },
    [pending, updateNote, saveBody, dismiss],
  );

  const visible =
    ctx.isReady &&
    ctx.hasShareIntent &&
    (sharedUrl !== null || fallbackPreviewText.length > 0);

  // Hardware back on Android — preserves the dismissal RN Modal
  // gave us via `onRequestClose` before the Modal → View refactor.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [visible, dismiss]);

  // Reset transient state on close so the next share starts clean.
  // The component stays mounted (returns null), so without this the
  // pending spinner / cached preview from a prior share would leak
  // forward.
  useEffect(() => {
    if (visible) return;
    setPending(false);
    setPreviewState("idle");
    setLinkPreview(null);
    setEnrichmentEnabled(true);
  }, [visible]);

  // Kick off the preview fetch when a URL share opens. Cancellation
  // via the `cancelled` flag prevents a stale fetch from setting
  // state if the user dismisses (or a new share replaces this one)
  // before the network call resolves.
  useEffect(() => {
    if (!visible || sharedUrl === null) return;
    if (previewState !== "idle") return;
    let cancelled = false;
    setPreviewState("loading");
    void (async () => {
      try {
        const preview = await fetchLinkPreview(sharedUrl);
        if (cancelled) return;
        setLinkPreview(preview);
        setPreviewState("loaded");
      } catch {
        if (cancelled) return;
        setPreviewState("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, sharedUrl, previewState]);

  if (!visible) {
    return null;
  }

  const showEnrichedPreview =
    sharedUrl !== null &&
    enrichmentEnabled &&
    previewState === "loaded" &&
    linkPreview !== null;
  const showLoadingPreview =
    sharedUrl !== null && previewState === "loading";

  // Rendered as a positioned overlay (not RN Modal) so the append
  // picker's `BottomSheetModal` portal sits above this surface
  // instead of behind it.
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View
        style={[
          styles.backdrop,
          { backgroundColor: `${themeColors.background}E6` },
        ]}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: themeColors.card,
              borderColor: themeColors.border,
              marginTop: insets.top + spacing.lg,
              marginBottom: insets.bottom + spacing.lg,
            },
          ]}
        >
          <View style={styles.header}>
            <MaterialCommunityIcons
              name="note-plus-outline"
              size={20}
              color={themeColors.primary}
            />
            <Text style={[styles.title, { color: themeColors.foreground }]}>
              Save to NoteSync
            </Text>
            <Pressable
              onPress={dismiss}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [
                styles.closeButton,
                pressed && { opacity: 0.6 },
              ]}
            >
              <MaterialCommunityIcons
                name="close"
                size={20}
                color={themeColors.muted}
              />
            </Pressable>
          </View>

          <View
            style={[
              styles.titleRow,
              { borderBottomColor: themeColors.border },
            ]}
          >
            <Text style={[styles.titleLabel, { color: themeColors.muted }]}>
              Title
            </Text>
            <Text
              style={[styles.titleValue, { color: themeColors.foreground }]}
              numberOfLines={1}
            >
              {saveTitle}
            </Text>
          </View>

          <ScrollView
            style={styles.previewScroll}
            contentContainerStyle={styles.previewContent}
          >
            {showLoadingPreview ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={themeColors.muted} />
                <Text style={[styles.loadingText, { color: themeColors.muted }]}>
                  Fetching preview…
                </Text>
              </View>
            ) : showEnrichedPreview && linkPreview ? (
              <View>
                {linkPreview.imageUrl ? (
                  <Image
                    source={{ uri: linkPreview.imageUrl }}
                    style={[
                      styles.thumbnail,
                      { backgroundColor: themeColors.input },
                    ]}
                    resizeMode="cover"
                    accessibilityLabel={
                      linkPreview.title ?? "Link preview thumbnail"
                    }
                  />
                ) : null}
                {linkPreview.title ? (
                  <Text
                    style={[
                      styles.previewTitle,
                      { color: themeColors.foreground },
                    ]}
                  >
                    {linkPreview.title}
                  </Text>
                ) : null}
                {linkPreview.description ? (
                  <Text
                    style={[styles.preview, { color: themeColors.foreground }]}
                  >
                    {linkPreview.description}
                  </Text>
                ) : null}
                <Text
                  style={[styles.previewUrl, { color: themeColors.muted }]}
                  numberOfLines={2}
                >
                  {linkPreview.url}
                </Text>
                <Pressable
                  onPress={() => setEnrichmentEnabled(false)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Save without preview metadata"
                  style={({ pressed }) => [
                    styles.dismissEnrichmentChip,
                    {
                      borderColor: themeColors.border,
                      backgroundColor: themeColors.input,
                    },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={14}
                    color={themeColors.muted}
                  />
                  <Text
                    style={[
                      styles.dismissEnrichmentText,
                      { color: themeColors.muted },
                    ]}
                  >
                    Save URL only
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={[styles.preview, { color: themeColors.foreground }]}>
                {saveBody}
              </Text>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={dismiss}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: themeColors.border,
                  backgroundColor: themeColors.input,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: themeColors.foreground },
                ]}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleOpenAppendPicker}
              disabled={pending}
              accessibilityRole="button"
              accessibilityLabel="Append to existing note"
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: themeColors.border,
                  backgroundColor: themeColors.input,
                },
                (pressed || pending) && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: themeColors.foreground },
                ]}
                numberOfLines={1}
              >
                Append to…
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={pending}
              accessibilityRole="button"
              accessibilityLabel="Save as new note"
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: themeColors.primary },
                (pressed || pending) && { opacity: 0.7 },
              ]}
            >
              {pending ? (
                <ActivityIndicator
                  size="small"
                  color={themeColors.background}
                />
              ) : (
                <Text
                  style={[
                    styles.primaryButtonText,
                    { color: themeColors.background },
                  ]}
                  numberOfLines={1}
                >
                  Save new
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
      <AppendTargetSheet
        bottomSheetRef={appendSheetRef}
        onSelectNote={handleAppendToNote}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    flex: 1,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
    flexShrink: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  titleLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  titleValue: {
    fontSize: 14,
    flex: 1,
  },
  previewScroll: {
    maxHeight: 360,
  },
  previewContent: {
    padding: spacing.md,
  },
  preview: {
    fontSize: 14,
    lineHeight: 20,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  previewUrl: {
    fontSize: 12,
    marginTop: spacing.sm,
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 1.91, // og:image canonical 1200x630 ratio
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    fontSize: 14,
  },
  dismissEnrichmentChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  dismissEnrichmentText: {
    fontSize: 12,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  primaryButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
