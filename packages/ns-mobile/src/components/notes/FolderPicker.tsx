import React, { useCallback, useMemo } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { FolderInfo } from "@derekentringer/ns-shared";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";

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

  const flatFolders = useMemo(() => {
    const allNotes: FlatFolder = {
      id: undefined,
      name: "All Notes",
      depth: 0,
      count: 0,
    };
    const unfiled: FlatFolder = {
      id: "unfiled",
      name: "Unfiled",
      depth: 0,
      count: 0,
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
    [selectedFolderId, themeColors, handleSelect],
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["50%", "80%"]}
      backgroundStyle={{ backgroundColor: themeColors.background }}
      handleIndicatorStyle={{ backgroundColor: themeColors.muted }}
    >
      <BottomSheetView style={styles.content}>
        <Text style={[styles.title, { color: themeColors.foreground }]}>
          Folder
        </Text>
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
  title: {
    fontSize: 17,
    fontWeight: "600",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
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
