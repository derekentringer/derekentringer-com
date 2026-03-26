import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { NoteVersion } from "@derekentringer/ns-shared";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { relativeTime } from "@/lib/time";

interface VersionHistorySheetProps {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  versions: NoteVersion[];
  isLoading: boolean;
  onRestore: (versionId: string) => void;
  isRestoring: boolean;
}

export function VersionHistorySheet({
  bottomSheetRef,
  versions,
  isLoading,
  onRestore,
  isRestoring,
}: VersionHistorySheetProps) {
  const themeColors = useThemeColors();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleRestore = useCallback(
    (versionId: string) => {
      Alert.alert(
        "Restore Version",
        "This will replace the current content with this version. Continue?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore",
            onPress: () => onRestore(versionId),
          },
        ],
      );
    },
    [onRestore],
  );

  const renderItem = useCallback(
    ({ item }: { item: NoteVersion }) => {
      const isExpanded = expandedId === item.id;

      return (
        <View
          style={[
            styles.versionItem,
            {
              backgroundColor: themeColors.card,
              borderColor: themeColors.border,
            },
          ]}
        >
          <Pressable
            style={styles.versionHeader}
            onPress={() => setExpandedId(isExpanded ? null : item.id)}
            accessibilityRole="button"
          >
            <View style={styles.versionInfo}>
              <Text style={[styles.versionTime, { color: themeColors.foreground }]}>
                {relativeTime(item.createdAt)}
              </Text>
              <Text style={[styles.versionOrigin, { color: themeColors.muted }]}>
                {item.origin}
              </Text>
            </View>
            <MaterialCommunityIcons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={themeColors.muted}
            />
          </Pressable>

          {isExpanded ? (
            <View style={styles.expandedContent}>
              <Text
                style={[styles.versionTitle, { color: themeColors.foreground }]}
              >
                {item.title || "Untitled"}
              </Text>
              <Text
                style={[styles.versionContent, { color: themeColors.muted }]}
                numberOfLines={10}
              >
                {item.content || "(empty)"}
              </Text>
              <Pressable
                style={[
                  styles.restoreButton,
                  { backgroundColor: themeColors.primary },
                ]}
                onPress={() => handleRestore(item.id)}
                disabled={isRestoring}
                accessibilityRole="button"
              >
                {isRestoring ? (
                  <ActivityIndicator size="small" color={themeColors.background} />
                ) : (
                  <Text
                    style={[
                      styles.restoreText,
                      { color: themeColors.background },
                    ]}
                  >
                    Restore This Version
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      );
    },
    [expandedId, themeColors, handleRestore, isRestoring],
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["60%", "90%"]}
      backgroundStyle={{ backgroundColor: themeColors.background }}
      handleIndicatorStyle={{ backgroundColor: themeColors.muted }}
    >
      <BottomSheetView style={styles.content}>
        <Text style={[styles.title, { color: themeColors.foreground }]}>
          Version History
        </Text>

        {isLoading ? (
          <ActivityIndicator
            size="large"
            color={themeColors.primary}
            style={styles.loader}
          />
        ) : versions.length === 0 ? (
          <Text style={[styles.emptyText, { color: themeColors.muted }]}>
            No versions available
          </Text>
        ) : (
          <FlatList
            data={versions}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
          />
        )}
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
  list: {
    paddingHorizontal: spacing.md,
  },
  versionItem: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  versionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  versionInfo: {
    flex: 1,
  },
  versionTime: {
    fontSize: 14,
    fontWeight: "500",
  },
  versionOrigin: {
    fontSize: 12,
    marginTop: 2,
  },
  expandedContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  versionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  versionContent: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  restoreButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  restoreText: {
    fontSize: 14,
    fontWeight: "600",
  },
  loader: {
    marginTop: spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
