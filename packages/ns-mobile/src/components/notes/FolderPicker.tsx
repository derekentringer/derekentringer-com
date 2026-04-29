import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
  Modal,
  TextInput,
  StyleSheet,
} from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import type { FolderInfo } from "@derekentringer/ns-shared";
import { useThemeColors, type ThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import {
  useCreateFolder,
  useRenameFolder,
  useDeleteFolder,
} from "@/hooks/useFolders";

interface FolderPickerProps {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  folders: FolderInfo[];
  selectedFolderId: string | undefined;
  onSelect: (folderId: string | undefined) => void;
  /** "filter" (default): list-screen filtering UX — both "All
   *  Notes" and "Unfiled" appear as system entries.
   *  "assign": editor folder-assignment UX — only "Unfiled" is
   *  available since "All Notes" isn't a real bucket a note can
   *  live in. Mirrors web/desktop where the editor's folder
   *  dropdown lists Unfiled + real folders, no All Notes. */
  mode?: "filter" | "assign";
}

interface FlatFolder {
  id: string | undefined;
  name: string;
  depth: number;
  count: number;
  isSystem?: boolean;
}

interface PromptState {
  visible: boolean;
  title: string;
  message: string;
  defaultValue: string;
  onSubmit: (value: string) => void;
}

interface ActionMenuState {
  visible: boolean;
  title: string;
  item: FlatFolder | null;
}

function flattenFolderTree(
  folders: FolderInfo[],
  depth = 0,
): FlatFolder[] {
  const result: FlatFolder[] = [];
  for (const folder of folders) {
    result.push({
      id: folder.id,
      name: folder.name,
      depth,
      count: folder.totalCount,
    });
    if (folder.children?.length) {
      result.push(...flattenFolderTree(folder.children, depth + 1));
    }
  }
  return result;
}

function PromptDialog({
  prompt,
  onClose,
  themeColors,
}: {
  prompt: PromptState;
  onClose: () => void;
  themeColors: ThemeColors;
}) {
  const [value, setValue] = useState(prompt.defaultValue);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setValue(prompt.defaultValue);
    if (prompt.visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [prompt.visible, prompt.defaultValue]);

  const handleSubmit = () => {
    if (value.trim()) {
      prompt.onSubmit(value.trim());
      onClose();
    }
  };

  return (
    <Modal
      visible={prompt.visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={promptStyles.backdrop} onPress={onClose}>
        <Pressable
          style={[promptStyles.dialog, { backgroundColor: themeColors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[promptStyles.title, { color: themeColors.foreground }]}>
            {prompt.title}
          </Text>
          <Text style={[promptStyles.message, { color: themeColors.muted }]}>
            {prompt.message}
          </Text>
          <TextInput
            ref={inputRef}
            style={[
              promptStyles.input,
              {
                color: themeColors.foreground,
                backgroundColor: themeColors.input,
                borderColor: themeColors.border,
              },
            ]}
            value={value}
            onChangeText={setValue}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
            autoFocus
            selectTextOnFocus
            placeholderTextColor={themeColors.muted}
          />
          <View style={promptStyles.buttons}>
            <Pressable
              style={[promptStyles.button, { backgroundColor: themeColors.border }]}
              onPress={onClose}
            >
              <Text style={[promptStyles.buttonText, { color: themeColors.foreground }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              style={[promptStyles.button, { backgroundColor: themeColors.primary }]}
              onPress={handleSubmit}
            >
              <Text style={[promptStyles.buttonText, { color: themeColors.background }]}>
                OK
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const promptStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  dialog: {
    width: "100%",
    maxWidth: 320,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  message: {
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  button: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

function ActionMenuDialog({
  menu,
  onClose,
  onRename,
  onDelete,
  themeColors,
}: {
  menu: ActionMenuState;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  themeColors: ThemeColors;
}) {
  return (
    <Modal
      visible={menu.visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={promptStyles.backdrop} onPress={onClose}>
        <Pressable
          style={[promptStyles.dialog, { backgroundColor: themeColors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[promptStyles.title, { color: themeColors.foreground }]}>
            {menu.title}
          </Text>
          <View style={actionMenuStyles.buttons}>
            <View style={actionMenuStyles.leftButtons}>
              <Pressable
                style={[promptStyles.button, { backgroundColor: themeColors.primary }]}
                onPress={() => {
                  onClose();
                  onRename();
                }}
              >
                <Text style={[promptStyles.buttonText, { color: themeColors.background }]}>
                  Rename
                </Text>
              </Pressable>
              <Pressable
                style={[promptStyles.button, { backgroundColor: themeColors.destructive }]}
                onPress={() => {
                  onClose();
                  onDelete();
                }}
              >
                <Text style={[promptStyles.buttonText, { color: "#fff" }]}>
                  Delete
                </Text>
              </Pressable>
            </View>
            <Pressable
              style={[promptStyles.button, { backgroundColor: themeColors.border }]}
              onPress={onClose}
            >
              <Text style={[promptStyles.buttonText, { color: themeColors.foreground }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const actionMenuStyles = StyleSheet.create({
  buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
  },
  leftButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});

const INITIAL_PROMPT: PromptState = {
  visible: false,
  title: "",
  message: "",
  defaultValue: "",
  onSubmit: () => {},
};

const INITIAL_ACTION_MENU: ActionMenuState = {
  visible: false,
  title: "",
  item: null,
};

export function FolderPicker({
  bottomSheetRef,
  folders,
  selectedFolderId,
  onSelect,
  mode = "filter",
}: FolderPickerProps) {
  const themeColors = useThemeColors();
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();
  const [prompt, setPrompt] = useState<PromptState>(INITIAL_PROMPT);
  const [actionMenu, setActionMenu] = useState<ActionMenuState>(INITIAL_ACTION_MENU);

  const closePrompt = useCallback(() => {
    setPrompt(INITIAL_PROMPT);
  }, []);

  const closeActionMenu = useCallback(() => {
    setActionMenu(INITIAL_ACTION_MENU);
  }, []);

  const flatFolders = useMemo(() => {
    const allNotes: FlatFolder = {
      id: undefined,
      name: "All Notes",
      depth: 0,
      count: 0,
      isSystem: true,
    };
    const unfiled: FlatFolder = {
      id: "unfiled",
      name: "Unfiled",
      depth: 0,
      count: 0,
      isSystem: true,
    };
    const systemEntries =
      mode === "assign" ? [unfiled] : [allNotes, unfiled];
    return [...systemEntries, ...flattenFolderTree(folders)];
  }, [folders, mode]);

  const handleSelect = useCallback(
    (folderId: string | undefined) => {
      onSelect(folderId);
      bottomSheetRef.current?.dismiss();
    },
    [onSelect, bottomSheetRef],
  );

  const handleCreateFolder = useCallback(() => {
    setPrompt({
      visible: true,
      title: "New Folder",
      message: "Enter folder name:",
      defaultValue: "",
      onSubmit: (name: string) => {
        createFolder.mutate(
          { name },
          {
            onSuccess: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
        );
      },
    });
  }, [createFolder]);

  const handleLongPress = useCallback(
    (item: FlatFolder) => {
      if (item.isSystem || !item.id) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActionMenu({ visible: true, title: item.name, item });
    },
    [],
  );

  const handleRenameFromMenu = useCallback(() => {
    const item = actionMenu.item;
    if (!item?.id) return;
    setPrompt({
      visible: true,
      title: "Rename Folder",
      message: "Enter new name:",
      defaultValue: item.name,
      onSubmit: (newName: string) => {
        if (item.id) {
          renameFolder.mutate(
            { folderId: item.id, newName },
            {
              onSuccess: () => {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
              },
            },
          );
        }
      },
    });
  }, [actionMenu.item, renameFolder]);

  const handleDeleteFromMenu = useCallback(() => {
    const item = actionMenu.item;
    if (!item?.id) return;
    Alert.alert(
      "Delete Folder",
      `Delete "${item.name}"? Notes will be moved to the parent folder.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (item.id) {
              deleteFolder.mutate(
                { folderId: item.id, mode: "move-up" },
                {
                  onSuccess: () => {
                    Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Success,
                    );
                  },
                },
              );
            }
          },
        },
      ],
    );
  }, [actionMenu.item, deleteFolder]);

  const renderItem = useCallback(
    ({ item }: { item: FlatFolder }) => {
      const isSelected =
        item.id === selectedFolderId ||
        (item.id === undefined && selectedFolderId === undefined);

      return (
        <Pressable
          style={[
            styles.row,
            { paddingLeft: spacing.md + item.depth * 20 },
            isSelected && { backgroundColor: `${themeColors.primary}1A` },
          ]}
          onPress={() => handleSelect(item.id)}
          onLongPress={() => handleLongPress(item)}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name={item.id === undefined ? "note-text-outline" : "folder-outline"}
            size={18}
            color={isSelected ? themeColors.primary : themeColors.muted}
          />
          <Text
            style={[
              styles.folderName,
              {
                color: isSelected
                  ? themeColors.primary
                  : themeColors.foreground,
              },
            ]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {item.count > 0 ? (
            <Text style={[styles.count, { color: themeColors.muted }]}>
              {item.count}
            </Text>
          ) : null}
          {isSelected ? (
            <MaterialCommunityIcons
              name="check"
              size={18}
              color={themeColors.primary}
            />
          ) : null}
        </Pressable>
      );
    },
    [selectedFolderId, themeColors, handleSelect, handleLongPress],
  );

  return (
    <>
      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={["50%", "80%"]}
        backgroundStyle={{ backgroundColor: themeColors.background }}
        handleIndicatorStyle={{ backgroundColor: themeColors.muted }}
      >
        <BottomSheetView style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: themeColors.foreground }]}>
              Folder
            </Text>
            <Pressable
              style={[styles.newFolderButton, { backgroundColor: `${themeColors.primary}1A` }]}
              onPress={handleCreateFolder}
              accessibilityRole="button"
              accessibilityLabel="Create new folder"
            >
              <MaterialCommunityIcons
                name="folder-plus-outline"
                size={16}
                color={themeColors.primary}
              />
              <Text style={[styles.newFolderText, { color: themeColors.primary }]}>
                New Folder
              </Text>
            </Pressable>
          </View>
          <FlatList
            data={flatFolders}
            keyExtractor={(item) => item.id ?? "all"}
            renderItem={renderItem}
          />
        </BottomSheetView>
      </BottomSheetModal>
      <PromptDialog
        prompt={prompt}
        onClose={closePrompt}
        themeColors={themeColors}
      />
      <ActionMenuDialog
        menu={actionMenu}
        onClose={closeActionMenu}
        onRename={handleRenameFromMenu}
        onDelete={handleDeleteFromMenu}
        themeColors={themeColors}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  newFolderButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  newFolderText: {
    fontSize: 13,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingRight: spacing.md,
    gap: spacing.sm,
  },
  folderName: {
    fontSize: 15,
    flex: 1,
  },
  count: {
    fontSize: 12,
    marginRight: spacing.xs,
  },
});
