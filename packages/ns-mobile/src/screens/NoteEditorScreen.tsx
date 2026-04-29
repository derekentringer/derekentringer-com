import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Markdown from "react-native-markdown-display";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NotesStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { formatCreatedDate, formatModifiedDate } from "@/lib/time";
import {
  useNote,
  useDeleteNote,
  useUpdateNote,
  useAllNotesForWikiLinks,
} from "@/hooks/useNotes";
import {
  resolveWikiLinks,
  parseWikiLinkUrl,
} from "@/lib/resolveWikiLinks";
import { useAutoSave } from "@/hooks/useAutoSave";
import useSyncStore from "@/store/syncStore";
import { useFolders } from "@/hooks/useFolders";
import { useTags } from "@/hooks/useTags";
import { FolderPicker } from "@/components/notes/FolderPicker";
import { MarkdownToolbar } from "@/components/notes/MarkdownToolbar";
import { TagInput } from "@/components/notes/TagInput";
import { AiActionsSheet, type AiActionKey } from "@/components/notes/AiActionsSheet";
import { SummaryBanner } from "@/components/notes/SummaryBanner";
import {
  summarizeNote as apiSummarizeNote,
  suggestTags as apiSuggestTags,
} from "@/api/ai";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import {
  toggleBold,
  toggleItalic,
  insertHeading,
  insertLink,
  insertList,
  insertCheckbox,
  insertCode,
  insertQuote,
} from "@/lib/editorActions";
import { findFolderName } from "@/lib/folders";
import {
  parseFrontmatter,
  serializeFrontmatter,
  stripFrontmatter,
} from "@derekentringer/ns-shared";
import useEditorSettingsStore from "@/store/editorSettingsStore";

type Props = NativeStackScreenProps<NotesStackParamList, "NoteEditor">;

export function NoteEditorScreen({ route, navigation }: Props) {
  const initialNoteId = route.params?.noteId;
  const themeColors = useThemeColors();

  const [noteId, setNoteId] = useState(initialNoteId);
  const [title, setTitle] = useState("");
  // `content` is always the full note text including the YAML
  // frontmatter block (if any). The TextInput renders either the
  // full content (source mode) or just the body (panel mode); on
  // edit we recombine the new body with the original frontmatter
  // so the YAML round-trips even when hidden.
  const [content, setContent] = useState("");
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [folderName, setFolderName] = useState<string | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [isLoaded, setIsLoaded] = useState(!initialNoteId);
  const [aiBusyKey, setAiBusyKey] = useState<AiActionKey | null>(null);

  const contentRef = useRef<TextInput>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const folderSheetRef = useRef<BottomSheetModal>(null);
  const aiSheetRef = useRef<BottomSheetModal>(null);

  const { data: noteData, isLoading } = useNote(noteId ?? "");
  const deleteNoteMutation = useDeleteNote();
  const updateNoteMutation = useUpdateNote();
  const { data: foldersData } = useFolders();
  // Title → noteId map for `[[wiki-link]]` resolution in preview.
  const { data: allNotes } = useAllNotesForWikiLinks();
  const titleToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of allNotes ?? []) {
      if (n.deletedAt) continue;
      if (n.title) map.set(n.title.toLowerCase(), n.id);
    }
    return map;
  }, [allNotes]);
  const handleLinkPress = useCallback(
    (url: string) => {
      const wikiNoteId = parseWikiLinkUrl(url);
      if (wikiNoteId) {
        navigation.push("NoteDetail", { noteId: wikiNoteId });
        return false;
      }
      return true;
    },
    [navigation],
  );
  const { data: tagsData } = useTags();
  const isOnline = useSyncStore((s) => s.isOnline);
  const propertiesMode = useEditorSettingsStore((s) => s.propertiesMode);
  const togglePropertiesMode = useEditorSettingsStore(
    (s) => s.togglePropertiesMode,
  );

  // Parsed view of the current content. `body` is what the user
  // sees in panel mode; `rawYaml`/`metadata`/`unknownFields` are
  // what we re-attach when they edit. Recomputed when `content`
  // changes.
  const parsed = useMemo(() => parseFrontmatter(content), [content]);
  const hasFrontmatter = parsed.rawYaml.trim().length > 0;
  const displayValue =
    propertiesMode === "panel" && hasFrontmatter
      ? stripFrontmatter(content)
      : content;


  const { save, flush, isSaving, isSaved, error } = useAutoSave({
    noteId,
    onCreated: (newId) => {
      setNoteId(newId);
    },
  });

  // Load existing note data
  useEffect(() => {
    if (noteData && !isLoaded) {
      setTitle(noteData.title || "");
      setContent(noteData.content || "");
      setFolderId(noteData.folderId ?? undefined);
      setFolderName(noteData.folder ?? undefined);
      setTags(noteData.tags || []);
      setSummary(noteData.summary ?? null);
      setIsLoaded(true);
    }
  }, [noteData, isLoaded]);

  // Keep the local summary mirror in sync if the note's summary
  // changes from outside this screen (e.g. AI Assistant chat ran
  // /summarize on this note from another device).
  useEffect(() => {
    if (isLoaded && noteData) {
      setSummary(noteData.summary ?? null);
    }
  }, [isLoaded, noteData?.summary]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save on title/content changes
  useEffect(() => {
    if (!isLoaded) return;

    save({
      title: title || "Untitled",
      content,
      folderId: folderId ?? undefined,
      folder: folderName ?? undefined,
      tags,
    });
  }, [title, content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Header options
  useEffect(() => {
    navigation.setOptions({
      title: noteId ? "Edit Note" : "New Note",
      headerRight: () => (
        <View style={styles.headerRight}>
          {!isPreview ? (
            <Pressable
              onPress={togglePropertiesMode}
              accessibilityRole="button"
              accessibilityLabel={
                propertiesMode === "source"
                  ? "Hide frontmatter"
                  : "Show frontmatter"
              }
              style={styles.headerButton}
            >
              <MaterialCommunityIcons
                name="code-tags"
                size={22}
                color={
                  propertiesMode === "source"
                    ? themeColors.primary
                    : themeColors.foreground
                }
              />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setIsPreview((p) => !p)}
            accessibilityRole="button"
            accessibilityLabel={isPreview ? "Edit" : "Preview"}
            style={styles.headerButton}
          >
            <MaterialCommunityIcons
              name={isPreview ? "pencil" : "eye"}
              size={22}
              color={themeColors.foreground}
            />
          </Pressable>
          {noteId ? (
            <Pressable
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete note"
              style={styles.headerButton}
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={22}
                color={themeColors.destructive}
              />
            </Pressable>
          ) : null}
        </View>
      ),
    });
  }, [navigation, noteId, isPreview, propertiesMode, themeColors]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush on unmount
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      flush();
    });
    return unsubscribe;
  }, [navigation, flush]);

  const handleDelete = useCallback(() => {
    Alert.alert("Move to Trash", "Move this note to Trash?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Move to Trash",
        style: "destructive",
        onPress: async () => {
          if (noteId) {
            await deleteNoteMutation.mutateAsync({ id: noteId });
          }
          navigation.goBack();
        },
      },
    ]);
  }, [noteId, deleteNoteMutation, navigation]);

  const handleFolderSelect = useCallback(
    (selectedFolderId: string | undefined) => {
      // "unfiled" and undefined both mean "no folder" in editor context
      const realFolderId =
        !selectedFolderId || selectedFolderId === "unfiled"
          ? undefined
          : selectedFolderId;

      setFolderId(realFolderId);
      const folder = foldersData?.folders && realFolderId
        ? findFolderName(foldersData.folders, realFolderId)
        : undefined;
      setFolderName(folder);

      if (noteId) {
        updateNoteMutation.mutate({
          id: noteId,
          data: { folderId: realFolderId ?? null, folder: folder ?? null },
        });
      }
    },
    [noteId, foldersData, updateNoteMutation],
  );

  const handleAddTag = useCallback(
    (tag: string) => {
      const newTags = [...tags, tag];
      setTags(newTags);
      if (noteId) {
        updateNoteMutation.mutate({ id: noteId, data: { tags: newTags } });
      }
    },
    [tags, noteId, updateNoteMutation],
  );

  const handleRemoveTag = useCallback(
    (tag: string) => {
      const newTags = tags.filter((t) => t !== tag);
      setTags(newTags);
      if (noteId) {
        updateNoteMutation.mutate({ id: noteId, data: { tags: newTags } });
      }
    },
    [tags, noteId, updateNoteMutation],
  );

  const handleToolbarAction = useCallback(
    (action: string) => {
      const { start, end } = selectionRef.current;

      const actions: Record<
        string,
        (t: string, s: number, e: number) => { text: string; selection: { start: number; end: number } }
      > = {
        bold: toggleBold,
        italic: toggleItalic,
        heading: insertHeading,
        link: insertLink,
        list: insertList,
        checkbox: insertCheckbox,
        code: insertCode,
        quote: insertQuote,
      };

      const fn = actions[action];
      if (!fn) return;

      // In panel mode the TextInput's selection is relative to the
      // visible body, not the full content (which has frontmatter
      // prepended). Operate on `displayValue`, then re-serialize
      // body + original frontmatter so the YAML round-trips.
      const result = fn(displayValue, start, end);
      const nextContent =
        propertiesMode === "panel" && hasFrontmatter
          ? serializeFrontmatter(
              parsed.metadata,
              result.text,
              parsed.unknownFields,
            )
          : result.text;
      setContent(nextContent);
      selectionRef.current = result.selection;

      // Re-focus and set selection after state update
      setTimeout(() => {
        contentRef.current?.setNativeProps({
          selection: result.selection,
        });
        contentRef.current?.focus();
      }, 50);
    },
    [displayValue, propertiesMode, hasFrontmatter, parsed],
  );

  // Phase B.1: generate AI summary for the current note. Saves
  // the in-flight content first (so the API sees the freshest
  // text), calls /ai/summarize, persists the resulting summary
  // via the existing useUpdateNote mutation. Mirrors web's
  // handleSummarize in NotesPage.
  const handleAiSummarize = useCallback(async () => {
    if (!noteId || aiBusyKey) return;
    setAiBusyKey("summarize");
    try {
      // Flush any pending auto-save so the server has the
      // freshest content before summarizing.
      flush();
      const result = await apiSummarizeNote(noteId);
      setSummary(result);
      await updateNoteMutation.mutateAsync({
        id: noteId,
        data: { summary: result },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate summary.";
      Alert.alert("AI Summary", message);
    } finally {
      setAiBusyKey(null);
    }
  }, [noteId, aiBusyKey, flush, updateNoteMutation]);

  // Phase B.2: ask the API for tag suggestions for the current
  // note, dedupe against the existing tag list, and persist the
  // merged set. Mirrors desktop's handleSuggestTags — no
  // confirmation UI; user can remove unwanted suggestions via the
  // chip X buttons afterward.
  const handleAiSuggestTags = useCallback(async () => {
    if (!noteId || aiBusyKey) return;
    setAiBusyKey("tags");
    try {
      flush();
      const suggested = await apiSuggestTags(noteId);
      if (suggested.length === 0) return;
      const merged = Array.from(new Set([...tags, ...suggested]));
      if (merged.length === tags.length) return;
      setTags(merged);
      await updateNoteMutation.mutateAsync({
        id: noteId,
        data: { tags: merged },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to suggest tags.";
      Alert.alert("AI Tags", message);
    } finally {
      setAiBusyKey(null);
    }
  }, [noteId, aiBusyKey, flush, tags, updateNoteMutation]);

  const handleAiSummaryDelete = useCallback(() => {
    if (!noteId) return;
    Alert.alert(
      "Delete Summary",
      "Delete this AI summary? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setSummary(null);
            updateNoteMutation.mutate({
              id: noteId,
              data: { summary: null },
            });
          },
        },
      ],
    );
  }, [noteId, updateNoteMutation]);

  const handleAiPress = useCallback(() => {
    Keyboard.dismiss();
    aiSheetRef.current?.present();
  }, []);

  const mdStyles = useMemo(
    () => ({
      body: { color: themeColors.foreground, fontSize: 15, lineHeight: 22 },
      // Heading parity with ns-web's `.markdown-preview h{1..3}` —
      // primary color on h1/h2, top margin so headings don't
      // collide with the prior paragraph. Mirrors NoteDetailScreen.
      heading1: {
        color: themeColors.primary,
        fontSize: 26,
        lineHeight: 34,
        fontWeight: "700" as const,
        marginTop: 16,
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: themeColors.border,
        paddingBottom: 12,
      },
      heading2: {
        color: themeColors.primary,
        fontSize: 21,
        fontWeight: "700" as const,
        marginTop: 16,
        marginBottom: 6,
      },
      heading3: {
        color: themeColors.foreground,
        fontSize: 17,
        fontWeight: "600" as const,
        marginTop: 12,
        marginBottom: 4,
      },
      heading4: {
        color: themeColors.foreground,
        fontSize: 15,
        fontWeight: "600" as const,
        marginTop: 10,
        marginBottom: 4,
      },
      heading5: {
        color: themeColors.foreground,
        fontSize: 15,
        fontWeight: "600" as const,
        marginTop: 10,
        marginBottom: 4,
      },
      heading6: {
        color: themeColors.foreground,
        fontSize: 15,
        fontWeight: "600" as const,
        marginTop: 10,
        marginBottom: 4,
      },
      code_inline: {
        backgroundColor: themeColors.card,
        color: themeColors.primary,
        borderRadius: 4,
        paddingHorizontal: 4,
      },
      code_block: { backgroundColor: themeColors.card, borderRadius: 8, padding: 12, color: themeColors.foreground },
      fence: { backgroundColor: themeColors.card, borderRadius: 8, padding: 12, color: themeColors.foreground },
      blockquote: {
        backgroundColor: themeColors.card,
        borderLeftWidth: 3,
        borderLeftColor: themeColors.primary,
        paddingHorizontal: 12,
        paddingVertical: 4,
      },
      link: { color: themeColors.primary },
      // Mirrors NoteDetailScreen: explicit height + margins so the
      // hr renders as a visible 1px rule with breathing room above
      // and below (web's `.markdown-preview hr`: 1px border +
      // 1.5em margin).
      hr: {
        backgroundColor: themeColors.border,
        height: 1,
        marginTop: 24,
        marginBottom: 24,
      },
    }),
    [themeColors],
  );

  if (initialNoteId && isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingContainer}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={5} style={{ marginTop: spacing.md }} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      {/* Status line */}
      <View style={styles.statusBar}>
        <Text style={[styles.statusText, { color: isSaving ? themeColors.muted : error ? themeColors.error : themeColors.muted }]}>
          {isSaving ? "Saving..." : error ? "Save failed" : isOnline ? "Saved" : "Saved locally"}
          {noteData ? ` · Created ${formatCreatedDate(noteData.createdAt)} · Modified ${formatModifiedDate(noteData.updatedAt)}` : ""}
        </Text>
      </View>

      {isPreview ? (
        <ScrollView
          style={styles.previewScroll}
          contentContainerStyle={styles.previewContent}
        >
          {title ? (
            <Text style={[styles.previewTitle, { color: themeColors.foreground }]}>
              {title}
            </Text>
          ) : null}
          {content ? (
            <Markdown style={mdStyles} onLinkPress={handleLinkPress}>
              {resolveWikiLinks(stripFrontmatter(content), titleToIdMap)}
            </Markdown>
          ) : (
            <Text style={[styles.emptyContent, { color: themeColors.muted }]}>
              No content
            </Text>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.editorScroll}
          contentContainerStyle={styles.editorContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <TextInput
            style={[styles.titleInput, { color: themeColors.foreground }]}
            placeholder="Title"
            placeholderTextColor={themeColors.muted}
            value={title}
            onChangeText={setTitle}
            autoFocus={!initialNoteId}
            returnKeyType="next"
            onSubmitEditing={() => contentRef.current?.focus()}
            blurOnSubmit={false}
          />

          {/* Folder + Summary + Tags row — matches web/desktop
              order: folder picker, AI summary banner, then tags. */}
          <View style={styles.metaSection}>
            <Pressable
              style={[styles.folderButton, { borderColor: themeColors.border }]}
              onPress={() => {
                Keyboard.dismiss();
                folderSheetRef.current?.present();
              }}
              accessibilityRole="button"
              accessibilityLabel="Select folder"
            >
              <MaterialCommunityIcons
                name="folder-outline"
                size={16}
                color={themeColors.muted}
              />
              <Text
                style={[
                  styles.folderButtonText,
                  // "Unfiled" is the real bucket the note lives in
                  // when no folder is set — the same label web/
                  // desktop use. Treat it as a regular foreground
                  // label rather than the muted "No folder"
                  // placeholder we used to show.
                  { color: themeColors.foreground },
                ]}
                numberOfLines={1}
              >
                {folderName || "Unfiled"}
              </Text>
              <MaterialCommunityIcons
                name="chevron-down"
                size={16}
                color={themeColors.muted}
              />
            </Pressable>

            <SummaryBanner
              summary={summary}
              onDelete={handleAiSummaryDelete}
              isLoading={aiBusyKey === "summarize"}
            />

            <TagInput
              tags={tags}
              allTags={tagsData?.tags ?? []}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
              isLoading={aiBusyKey === "tags"}
            />
          </View>

          {/* Toolbar (full-width) — sparkle button opens the AI
              actions sheet. */}
          <View style={styles.toolbarWrapper}>
            <MarkdownToolbar
              onAction={handleToolbarAction}
              onAiPress={noteId ? handleAiPress : undefined}
            />
          </View>

          {/* Content. When propertiesMode === "panel" and the note
              has frontmatter, the TextInput shows the body only; on
              edit we re-serialize body + the original frontmatter
              so the YAML round-trips through saves. In source mode
              the TextInput shows the full note including the YAML
              block, matching web's `</>` toggle. */}
          <TextInput
            ref={contentRef}
            style={[styles.contentInput, { color: themeColors.foreground }]}
            placeholder="Start writing..."
            placeholderTextColor={themeColors.muted}
            value={displayValue}
            onChangeText={(next) => {
              if (propertiesMode === "panel" && hasFrontmatter) {
                setContent(
                  serializeFrontmatter(
                    parsed.metadata,
                    next,
                    parsed.unknownFields,
                  ),
                );
              } else {
                setContent(next);
              }
            }}
            multiline
            textAlignVertical="top"
            scrollEnabled={false}
            onSelectionChange={(e) => {
              selectionRef.current = e.nativeEvent.selection;
            }}
          />
        </ScrollView>
      )}

      {/* Folder picker — "assign" mode hides the All Notes entry
          since a note can't live in that virtual bucket; only
          Unfiled + real folders are valid targets here. A note
          with no folderId is "Unfiled", so we coerce undefined
          → "unfiled" so the picker highlights that row as
          selected (the FolderPicker's Unfiled entry has id
          "unfiled"). */}
      <FolderPicker
        bottomSheetRef={folderSheetRef}
        folders={foldersData?.folders ?? []}
        selectedFolderId={folderId ?? "unfiled"}
        onSelect={handleFolderSelect}
        mode="assign"
      />

      {/* AI Actions sheet (Phase B). Phase B.1 wires Summarize;
          tags/continue/rewrite are placeholders until B.2-B.4. */}
      <AiActionsSheet
        bottomSheetRef={aiSheetRef}
        busyKey={aiBusyKey}
        handlers={{
          summarize: handleAiSummarize,
          tags: handleAiSuggestTags,
          continue: null,
          rewrite: null,
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    padding: spacing.md,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerButton: {
    padding: spacing.xs,
  },
  statusBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 0,
    minHeight: 20,
  },
  statusText: {
    fontSize: 11,
  },
  editorScroll: {
    flex: 1,
  },
  editorContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: spacing.sm,
    padding: 0,
  },
  toolbarWrapper: {
    marginTop: spacing.sm,
    marginHorizontal: -spacing.md,
    marginBottom: spacing.sm,
  },
  contentInput: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    minHeight: 200,
    padding: 0,
  },
  metaSection: {
    gap: spacing.sm,
  },
  folderButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 4,
  },
  folderButtonText: {
    fontSize: 13,
    maxWidth: 150,
  },
  previewScroll: {
    flex: 1,
  },
  previewContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  emptyContent: {
    fontSize: 15,
    fontStyle: "italic",
  },
});
