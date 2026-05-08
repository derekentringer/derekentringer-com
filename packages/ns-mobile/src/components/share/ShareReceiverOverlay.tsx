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
  classifySharedContent,
  deriveLinkPreviewTitle,
  formatLinkPreviewBody,
} from "@/lib/linkPreviewMarkdown";
import { fetchLinkPreview } from "@/api/links";
import {
  deriveImageTitle,
  uploadSharedImage,
} from "@/lib/shareImageUpload";
import { AppendTargetSheet } from "./AppendTargetSheet";

/**
 * Phase E.1–E.5 — Share-sheet receiver. When the user shares text,
 * a URL, or an image from another app, this overlay renders on top
 * of the tab navigator and offers Save-new / Append-to-existing
 * actions.
 *
 * URL shares (E.4) call /links/preview to grab the page's title +
 * description + og:image (re-hosted to our R2 CDN). The user can
 * dismiss the metadata via an X chip and save just the bare URL.
 *
 * Image shares (E.5) detect a media intent with an image MIME and
 * route through the existing image-upload pipeline: the saved note
 * gets the standard `![]({r2Url})` markdown reference. Save-new
 * creates an empty note first, uploads the image scoped to that
 * note, and patches the content; Append-to uploads scoped to the
 * picked target note and appends the same markdown after the
 * Phase E.3 separator/timestamp.
 */
type PreviewState = "idle" | "loading" | "loaded" | "failed";

interface ImageShare {
  uri: string;
  mimeType: string;
  filename: string;
}

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
  const sharedFiles = ctx.shareIntent?.files ?? null;

  // Image shares are surfaced by expo-share-intent as `type: "media"`
  // with a single file entry whose `mimeType` starts with "image/".
  // We only support single-image shares in v1 — multi-image batches
  // are out of scope per the Phase E plan.
  const imageShare = useMemo<ImageShare | null>(() => {
    if (ctx.shareIntent?.type !== "media") return null;
    const file = sharedFiles?.[0];
    if (!file) return null;
    if (!file.mimeType?.startsWith("image/")) return null;
    return {
      uri: file.path,
      mimeType: file.mimeType,
      filename: file.fileName ?? "",
    };
  }, [ctx.shareIntent?.type, sharedFiles]);

  const { url: sharedUrl, bodyText: sharedBodyText } = useMemo(
    () => classifySharedContent(sharedText, sharedWebUrl),
    [sharedText, sharedWebUrl],
  );

  // Whether the saved markdown should include the link-preview
  // metadata (image / og:title / og:description / URL) or just the
  // user's text + bare URL. Toggled off via the "Save URL only" chip.
  const isEnrichedUrlShare =
    sharedUrl !== null &&
    enrichmentEnabled &&
    previewState === "loaded" &&
    linkPreview !== null;

  // Title for the new-note path. Image shares use the source
  // filename (without extension); URL shares prefer og:title with
  // bodyText fallback; pure-text shares use the first non-empty
  // line of the shared text.
  const saveTitle = useMemo(() => {
    if (imageShare !== null) {
      return deriveImageTitle(imageShare.filename);
    }
    if (sharedUrl !== null) {
      const previewForTitle: LinkPreview = linkPreview ?? {
        url: sharedUrl,
        title: null,
        description: null,
        imageUrl: null,
      };
      return deriveLinkPreviewTitle(
        previewForTitle,
        sharedBodyText,
        isEnrichedUrlShare,
      );
    }
    const firstLine = sharedBodyText
      .split("\n")
      .find((l) => l.trim().length > 0);
    if (!firstLine) return "Shared note";
    const trimmed = firstLine.trim();
    return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  }, [
    imageShare,
    sharedUrl,
    linkPreview,
    isEnrichedUrlShare,
    sharedBodyText,
  ]);

  // Body content that the mutations send. Pure-text shares write
  // the user's text verbatim. URL shares compose bodyText + the
  // preview metadata via formatLinkPreviewBody — the heading is
  // included only on Save-new (Append-to lives inside an existing
  // note that already has its own heading).
  const buildSaveBody = useCallback(
    (includeTitleHeading: boolean): string => {
      if (sharedUrl !== null) {
        const previewForBody: LinkPreview = linkPreview ?? {
          url: sharedUrl,
          title: null,
          description: null,
          imageUrl: null,
        };
        return formatLinkPreviewBody(previewForBody, {
          bodyText: sharedBodyText,
          enriched: isEnrichedUrlShare,
          includeTitleHeading,
        });
      }
      return sharedBodyText;
    },
    [sharedUrl, linkPreview, isEnrichedUrlShare, sharedBodyText],
  );

  const dismiss = useCallback(() => {
    // `true` clears the native module's queued payload so a
    // subsequent share fires fresh.
    ctx.resetShareIntent(true);
  }, [ctx]);

  const handleSave = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      if (imageShare !== null) {
        // Image flow is multi-step: the upload endpoint requires a
        // noteId, so we create an empty note first, upload scoped
        // to it, then patch the content with the resulting R2 URL.
        // The Claude vision `aiDescription` is generated server-
        // side fire-and-forget — we don't wait for it.
        const note = await createNote.mutateAsync({
          title: saveTitle,
          content: "",
        });
        const { r2Url } = await uploadSharedImage({
          sourceUri: imageShare.uri,
          noteId: note.id,
        });
        await updateNote.mutateAsync({
          id: note.id,
          data: { content: `![](${r2Url})` },
        });
        dismiss();
        return;
      }
      await createNote.mutateAsync({
        title: saveTitle,
        content: buildSaveBody(true),
      });
      dismiss();
    } catch {
      setPending(false);
    }
  }, [
    pending,
    imageShare,
    createNote,
    updateNote,
    saveTitle,
    buildSaveBody,
    dismiss,
  ]);

  const handleOpenAppendPicker = useCallback(() => {
    if (pending) return;
    appendSheetRef.current?.present();
  }, [pending]);

  const handleAppendToNote = useCallback(
    async (target: Note) => {
      if (pending) return;
      setPending(true);
      try {
        let body: string;
        if (imageShare !== null) {
          const { r2Url } = await uploadSharedImage({
            sourceUri: imageShare.uri,
            noteId: target.id,
          });
          body = `![](${r2Url})`;
        } else {
          body = buildSaveBody(false);
        }
        const newContent = appendShareContent(
          target.content ?? "",
          body,
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
    [pending, imageShare, updateNote, buildSaveBody, dismiss],
  );

  const visible =
    ctx.isReady &&
    ctx.hasShareIntent &&
    (imageShare !== null ||
      sharedUrl !== null ||
      sharedBodyText.length > 0);

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

  // Kick off the preview fetch when a URL share opens. The deps are
  // intentionally limited to `visible` + `sharedUrl` — including
  // `previewState` here would cause the effect to re-run when we
  // transition idle → loading, the cleanup would set `cancelled =
  // true` for the in-flight fetch, and the result would be discarded
  // (the bug that pinned the UI on "Fetching preview…" forever).
  useEffect(() => {
    if (!visible || sharedUrl === null) return;
    let cancelled = false;
    setPreviewState("loading");
    setLinkPreview(null);
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
  }, [visible, sharedUrl]);

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
            {imageShare !== null ? (
              <Image
                source={{ uri: imageShare.uri }}
                style={[
                  styles.imageShareThumb,
                  { backgroundColor: themeColors.input },
                ]}
                resizeMode="contain"
                accessibilityLabel={
                  imageShare.filename || "Shared image"
                }
              />
            ) : null}

            {sharedBodyText.length > 0 ? (
              <Text
                style={[
                  styles.preview,
                  styles.bodyText,
                  { color: themeColors.foreground },
                ]}
              >
                {sharedBodyText}
              </Text>
            ) : null}

            {sharedUrl !== null ? (
              showLoadingPreview ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={themeColors.muted} />
                  <Text
                    style={[styles.loadingText, { color: themeColors.muted }]}
                  >
                    Fetching preview…
                  </Text>
                </View>
              ) : showEnrichedPreview && linkPreview ? (
                <View
                  style={[
                    styles.previewCard,
                    {
                      borderColor: themeColors.border,
                      backgroundColor: themeColors.input,
                    },
                  ]}
                >
                  {linkPreview.imageUrl ? (
                    <Image
                      source={{ uri: linkPreview.imageUrl }}
                      style={[
                        styles.thumbnail,
                        { backgroundColor: themeColors.background },
                      ]}
                      resizeMode="cover"
                      accessibilityLabel={
                        linkPreview.title ?? "Link preview thumbnail"
                      }
                    />
                  ) : null}
                  <View style={styles.previewCardBody}>
                    {linkPreview.title ? (
                      <Text
                        style={[
                          styles.previewTitle,
                          { color: themeColors.foreground },
                        ]}
                        numberOfLines={2}
                      >
                        {linkPreview.title}
                      </Text>
                    ) : null}
                    {linkPreview.description &&
                    sharedBodyText.length === 0 ? (
                      <Text
                        style={[
                          styles.preview,
                          { color: themeColors.foreground },
                        ]}
                        numberOfLines={3}
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
                  </View>
                </View>
              ) : (
                <Text
                  style={[styles.previewUrl, { color: themeColors.muted }]}
                  numberOfLines={2}
                >
                  {sharedUrl}
                </Text>
              )
            ) : null}

            {showEnrichedPreview ? (
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
            ) : null}
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
  bodyText: {
    marginBottom: spacing.md,
  },
  previewCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  previewCardBody: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  previewUrl: {
    fontSize: 12,
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 1.91, // og:image canonical 1200x630 ratio
  },
  imageShareThumb: {
    width: "100%",
    height: 240,
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
