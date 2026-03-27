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
import { useNote, useDeleteNote, useUpdateNote } from "@/hooks/useNotes";
import { useAutoSave } from "@/hooks/useAutoSave";
import useSyncStore from "@/store/syncStore";
import { useFolders } from "@/hooks/useFolders";
import { useTags } from "@/hooks/useTags";
import { FolderPicker } from "@/components/notes/FolderPicker";
import { MarkdownToolbar } from "@/components/notes/MarkdownToolbar";
import { TagInput } from "@/components/notes/TagInput";
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

type Props = NativeStackScreenProps<NotesStackParamList, "NoteEditor">;

export function NoteEditorScreen({ route, navigation }: Props) {
  const initialNoteId = route.params?.noteId;
  const themeColors = useThemeColors();

  const [noteId, setNoteId] = useState(initialNoteId);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [folderName, setFolderName] = useState<string | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [isPreview, setIsPreview] = useState(false);
  const [isLoaded, setIsLoaded] = useState(!initialNoteId);

  const contentRef = useRef<TextInput>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const folderSheetRef = useRef<BottomSheetModal>(null);

  const { data: noteData, isLoading } = useNote(noteId ?? "");
  const deleteNoteMutation = useDeleteNote();
  const updateNoteMutation = useUpdateNote();
  const { data: foldersData } = useFolders();
  const { data: tagsData } = useTags();
  const isOnline = useSyncStore((s) => s.isOnline);

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
      setIsLoaded(true);
    }
  }, [noteData, isLoaded]);

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
  }, [navigation, noteId, isPreview, themeColors]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush on unmount
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      flush();
    });
    return unsubscribe;
  }, [navigation, flush]);

  const handleDelete = useCallback(() => {
    Alert.alert("Delete Note", "Are you sure you want to delete this note?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
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

      const result = fn(content, start, end);
      setContent(result.text);
      selectionRef.current = result.selection;

      // Re-focus and set selection after state update
      setTimeout(() => {
        contentRef.current?.setNativeProps({
          selection: result.selection,
        });
        contentRef.current?.focus();
      }, 50);
    },
    [content],
  );

  const mdStyles = useMemo(
    () => ({
      body: { color: themeColors.foreground, fontSize: 15, lineHeight: 22 },
      heading1: { color: themeColors.foreground, fontSize: 24, fontWeight: "700" as const, marginBottom: 8 },
      heading2: { color: themeColors.foreground, fontSize: 20, fontWeight: "600" as const, marginBottom: 6 },
      heading3: { color: themeColors.foreground, fontSize: 17, fontWeight: "600" as const, marginBottom: 4 },
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
      hr: { backgroundColor: themeColors.border },
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
            <Markdown style={mdStyles}>{content}</Markdown>
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

          {/* Folder + Tags row */}
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
                  { color: folderName ? themeColors.foreground : themeColors.muted },
                ]}
                numberOfLines={1}
              >
                {folderName || "No folder"}
              </Text>
              <MaterialCommunityIcons
                name="chevron-down"
                size={16}
                color={themeColors.muted}
              />
            </Pressable>

            <TagInput
              tags={tags}
              allTags={tagsData?.tags ?? []}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
            />
          </View>

          {/* Toolbar (full-width) */}
          <View style={styles.toolbarWrapper}>
            <MarkdownToolbar onAction={handleToolbarAction} />
          </View>

          {/* Content */}
          <TextInput
            ref={contentRef}
            style={[styles.contentInput, { color: themeColors.foreground }]}
            placeholder="Start writing..."
            placeholderTextColor={themeColors.muted}
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
            scrollEnabled={false}
            onSelectionChange={(e) => {
              selectionRef.current = e.nativeEvent.selection;
            }}
          />
        </ScrollView>
      )}

      {/* Folder picker */}
      <FolderPicker
        bottomSheetRef={folderSheetRef}
        folders={foldersData?.folders ?? []}
        selectedFolderId={folderId}
        onSelect={handleFolderSelect}
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
    paddingVertical: 4,
    minHeight: 20,
  },
  statusText: {
    fontSize: 11,
  },
  editorScroll: {
    flex: 1,
  },
  editorContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: spacing.sm,
    padding: 0,
  },
  toolbarWrapper: {
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
    marginBottom: spacing.sm,
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
    padding: spacing.md,
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
