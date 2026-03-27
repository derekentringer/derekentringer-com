import React, { useCallback, useMemo } from "react";
import { View, Text, Pressable, FlatList, Alert, StyleSheet } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import type { FolderInfo } from "@derekentringer/ns-shared";
import { useThemeColors } from "@/theme/colors";
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
}

interface FlatFolder {
  id: string | undefined;
  name: string;
  depth: number;
  count: number;
  isSystem?: boolean;
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

export function FolderPicker({
  bottomSheetRef,
  folders,
  selectedFolderId,
  onSelect,
}: FolderPickerProps) {
  const themeColors = useThemeColors();
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();

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
    return [allNotes, unfiled, ...flattenFolderTree(folders)];
  }, [folders]);

  const handleSelect = useCallback(
    (folderId: string | undefined) => {
      onSelect(folderId);
      bottomSheetRef.current?.dismiss();
    },
    [onSelect, bottomSheetRef],
  );

  const handleCreateFolder = useCallback(() => {
    Alert.prompt("New Folder", "Enter folder name:", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Create",
        onPress: (name?: string) => {
          if (name?.trim()) {
            createFolder.mutate(
              { name: name.trim() },
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
    ]);
  }, [createFolder]);

  const handleLongPress = useCallback(
    (item: FlatFolder) => {
      if (item.isSystem || !item.id) return;

      Alert.alert(item.name, undefined, [
        {
          text: "Rename",
          onPress: () => {
            Alert.prompt("Rename Folder", "Enter new name:", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Rename",
                onPress: (newName?: string) => {
                  if (newName?.trim() && item.id) {
                    renameFolder.mutate(
                      { folderId: item.id, newName: newName.trim() },
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
            ], "plain-text", item.name);
          },
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
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
          },
        },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [renameFolder, deleteFolder],
  );

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
