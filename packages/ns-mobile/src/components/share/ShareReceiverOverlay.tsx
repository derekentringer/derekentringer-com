import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useShareIntentContext } from "expo-share-intent";
import type {
  FolderInfo,
  LinkPreview,
  Note,
} from "@derekentringer/ns-shared";
import { useCreateNote, useUpdateNote } from "@/hooks/useNotes";
import { useFolders } from "@/hooks/useFolders";
import { FolderPicker } from "@/components/notes/FolderPicker";
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
 *
 * Phase E.6 adds a folder picker so a Save-new can route the share
 * directly into a chosen folder (e.g. a "Reading List" or "Inbox")
 * rather than landing as Unfiled. Append-to ignores the picker
 * since the target note already lives wherever it lives.
 */
type PreviewState = "idle" | "loading" | "loaded" | "failed";

interface ImageShare {
  uri: string;
  mimeType: string;
  filename: string;
}

// Walk the folder tree (parent → children) looking for the id, and
// return the matching folder's name. Returns null when the id isn't
// found — the caller falls back to "Unfiled" in that case. Recursion
// is bounded by the tree depth, which the rest of the app already
// limits sensibly.
function findFolderName(
  folders: FolderInfo[],
  id: string | undefined,
): string | null {
  if (!id) return null;
  for (const folder of folders) {
    if (folder.id === id) return folder.name;
    if (folder.children?.length) {
      const child = findFolderName(folder.children, id);
      if (child) return child;
    }
  }
  return null;
}

export function ShareReceiverOverlay() {
  const ctx = useShareIntentContext();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const appendSheetRef = useRef<BottomSheetModal>(null);
  const folderSheetRef = useRef<BottomSheetModal>(null);
  const [pending, setPending] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const [enrichmentEnabled, setEnrichmentEnabled] = useState(true);
  // The destination folder for Save-new. `undefined` means the note
  // lands in Unfiled (the same place every receiver save went prior
  // to E.6). Append-to ignores this — the picked target's existing
  // folder is preserved.
  const [selectedFolderId, setSelectedFolderId] = useState<
    string | undefined
  >(undefined);
  const { data: foldersData } = useFolders();
  // The title field is editable. We derive a default from the share
  // intent (`saveTitle` below) and seed `editableTitle` with it,
  // but stop overwriting once the user has typed — otherwise their
  // edit would be clobbered when the preview fetch finishes and
  // changes the derived value.
  const [editableTitle, setEditableTitle] = useState("");
  const userEditedTitleRef = useRef(false);
  // Same pattern for the body text — the user can tweak quoted/
  // highlighted content before saving (fix typos, trim cruft, add
  // their own commentary). URL-only and image-only shares don't
  // surface this input; only shares that arrive with non-empty
  // body text get the editable area.
  const [editableBodyText, setEditableBodyText] = useState("");
  const userEditedBodyRef = useRef(false);

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
  // line of the shared text. Uses `editableBodyText` so any user
  // edit to the body content immediately re-derives a sensible
  // title default (until they edit the title too — `userEdited-
  // TitleRef` then freezes their custom title).
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
        editableBodyText,
        isEnrichedUrlShare,
      );
    }
    const firstLine = editableBodyText
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
    editableBodyText,
  ]);

  // Body content that the mutations send. Pure-text shares write
  // the user's (potentially edited) text verbatim. URL shares
  // compose bodyText + the preview metadata via formatLinkPreviewBody
  // — the heading is included only on Save-new (Append-to lives
  // inside an existing note that already has its own heading).
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
          bodyText: editableBodyText,
          enriched: isEnrichedUrlShare,
          includeTitleHeading,
        });
      }
      return editableBodyText;
    },
    [sharedUrl, linkPreview, isEnrichedUrlShare, editableBodyText],
  );

  const dismiss = useCallback(() => {
    // `true` clears the native module's queued payload so a
    // subsequent share fires fresh.
    ctx.resetShareIntent(true);
  }, [ctx]);

  const handleSave = useCallback(async () => {
    if (pending) return;
    setPending(true);
    // Empty / whitespace-only titles fall back to the derived
    // default so we never persist an "(Untitled)" save by mistake.
    const titleToSave = editableTitle.trim() || saveTitle || "Shared note";
    try {
      if (imageShare !== null) {
        // Image flow is multi-step: the upload endpoint requires a
        // noteId, so we create an empty note first, upload scoped
        // to it, then patch the content with the resulting R2 URL.
        // The Claude vision `aiDescription` is generated server-
        // side fire-and-forget — we don't wait for it.
        const note = await createNote.mutateAsync({
          title: titleToSave,
          content: "",
          folderId: selectedFolderId,
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
        title: titleToSave,
        content: buildSaveBody(true),
        folderId: selectedFolderId,
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
    editableTitle,
    saveTitle,
    selectedFolderId,
    buildSaveBody,
    dismiss,
  ]);

  const handleOpenAppendPicker = useCallback(() => {
    if (pending) return;
    appendSheetRef.current?.present();
  }, [pending]);

  const handleOpenFolderPicker = useCallback(() => {
    if (pending) return;
    Keyboard.dismiss();
    folderSheetRef.current?.present();
  }, [pending]);

  const handleFolderSelect = useCallback(
    (folderId: string | undefined) => {
      // FolderPicker's "Unfiled" entry has the sentinel id "unfiled";
      // normalize it back to `undefined` so it round-trips through
      // createNote correctly (Unfiled = no folder).
      setSelectedFolderId(folderId === "unfiled" ? undefined : folderId);
    },
    [],
  );

  const selectedFolderName = useMemo(() => {
    return (
      findFolderName(foldersData?.folders ?? [], selectedFolderId) ??
      "Unfiled"
    );
  }, [foldersData?.folders, selectedFolderId]);

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
    setEditableTitle("");
    setEditableBodyText("");
    setSelectedFolderId(undefined);
    userEditedTitleRef.current = false;
    userEditedBodyRef.current = false;
  }, [visible]);

  // Seed the editable title with the derived default and keep it
  // in sync until the user types into the field. Once they edit,
  // the ref flips and we stop overwriting their input even if the
  // derived `saveTitle` later changes (e.g. the link preview
  // fetch resolves and surfaces an og:title).
  useEffect(() => {
    if (userEditedTitleRef.current) return;
    setEditableTitle(saveTitle);
  }, [saveTitle]);

  // Same sync for the body text — initial seed from the parsed
  // share intent, frozen once the user starts typing.
  useEffect(() => {
    if (userEditedBodyRef.current) return;
    setEditableBodyText(sharedBodyText);
  }, [sharedBodyText]);

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
      <Pressable
        // Tap on the backdrop dismisses the keyboard (matching the
        // iOS convention) without closing the overlay. The card
        // below stops propagation so its own touches don't fire
        // this handler.
        onPress={Keyboard.dismiss}
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
            <TextInput
              value={editableTitle}
              onChangeText={(text) => {
                userEditedTitleRef.current = true;
                setEditableTitle(text);
              }}
              style={[styles.titleInput, { color: themeColors.foreground }]}
              placeholder="Shared note"
              placeholderTextColor={themeColors.muted}
              autoCorrect={false}
              autoCapitalize="sentences"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              blurOnSubmit
              accessibilityLabel="Note title"
            />
          </View>
          <View
            style={[
              styles.titleRow,
              { borderBottomColor: themeColors.border },
            ]}
          >
            <Text style={[styles.titleLabel, { color: themeColors.muted }]}>
              Folder
            </Text>
            <Pressable
              onPress={handleOpenFolderPicker}
              accessibilityRole="button"
              accessibilityLabel={`Folder: ${selectedFolderName}. Tap to change.`}
              style={({ pressed }) => [
                styles.folderTrigger,
                pressed && { opacity: 0.6 },
              ]}
            >
              <MaterialCommunityIcons
                name={
                  selectedFolderId ? "folder-outline" : "folder-off-outline"
                }
                size={16}
                color={themeColors.muted}
              />
              <Text
                style={[
                  styles.folderTriggerText,
                  { color: themeColors.foreground },
                ]}
                numberOfLines={1}
              >
                {selectedFolderName}
              </Text>
              <MaterialCommunityIcons
                name="chevron-down"
                size={16}
                color={themeColors.muted}
              />
            </Pressable>
          </View>
          <View style={styles.contentLabelRow}>
            <Text
              style={[styles.titleLabel, { color: themeColors.muted }]}
            >
              Content
            </Text>
          </View>

          <ScrollView
            style={styles.previewScroll}
            contentContainerStyle={styles.previewContent}
            // Lets the user tap the dismiss-enrichment chip / action
            // buttons in one go while the keyboard is open, instead
            // of needing a first tap to dismiss the keyboard and a
            // second tap to actually trigger the press.
            keyboardShouldPersistTaps="handled"
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
              <TextInput
                value={editableBodyText}
                onChangeText={(text) => {
                  userEditedBodyRef.current = true;
                  setEditableBodyText(text);
                }}
                multiline
                textAlignVertical="top"
                scrollEnabled={false}
                style={[
                  styles.preview,
                  styles.bodyText,
                  styles.bodyTextInput,
                  { color: themeColors.foreground },
                ]}
                placeholder="Shared content"
                placeholderTextColor={themeColors.muted}
                accessibilityLabel="Shared content"
              />
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
          </ScrollView>

          {showEnrichedPreview ? (
            <View
              style={[
                styles.dismissEnrichmentRow,
                { borderTopColor: themeColors.border },
              ]}
            >
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
          ) : null}

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
      </Pressable>
      <AppendTargetSheet
        bottomSheetRef={appendSheetRef}
        onSelectNote={handleAppendToNote}
      />
      <FolderPicker
        bottomSheetRef={folderSheetRef}
        folders={foldersData?.folders ?? []}
        selectedFolderId={selectedFolderId ?? "unfiled"}
        onSelect={handleFolderSelect}
        mode="assign"
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: 4,
  },
  titleLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  titleInput: {
    fontSize: 14,
    padding: 0,
  },
  folderTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 2,
  },
  folderTriggerText: {
    fontSize: 14,
    flex: 1,
  },
  contentLabelRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    // Matches the 4 px gap between TITLE and its input above so
    // the two label/value pairs read as the same visual rhythm.
    paddingBottom: 4,
  },
  previewScroll: {
    maxHeight: 360,
  },
  previewContent: {
    paddingHorizontal: spacing.md,
    // Top padding handled by `contentLabelRow` above to keep the
    // gap between the CONTENT label and the body equal to the
    // gap below TITLE.
    paddingTop: 0,
    paddingBottom: spacing.md,
  },
  preview: {
    fontSize: 14,
    lineHeight: 20,
  },
  bodyText: {
    marginBottom: spacing.md,
  },
  bodyTextInput: {
    // Reset RN TextInput's default cross-platform padding so the
    // editable body lines up with the static preview rendering on
    // top of it (no horizontal indent shift).
    padding: 0,
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
  dismissEnrichmentRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 0,
    borderTopWidth: 1,
  },
  dismissEnrichmentChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
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
