import React, { useCallback, useMemo } from "react";
import { View, Text, Pressable, FlatList, StyleSheet, Alert } from "react-native";
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { SyncRejection } from "@derekentringer/ns-shared";
import useSyncStore from "@/store/syncStore";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";

interface Props {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
}

function rejectionLabel(reason: SyncRejection["reason"]): string {
  switch (reason) {
    case "fk_constraint":
      return "Missing dependency";
    case "unique_constraint":
      return "Duplicate entry";
    case "not_found":
      return "Not found on server";
    case "timestamp_conflict":
      return "Conflict";
    default:
      return "Unknown error";
  }
}

export function SyncIssuesSheet({ bottomSheetRef }: Props) {
  const themeColors = useThemeColors();
  const rejections = useSyncStore((s) => s.rejections);
  const { forcePush, discard } = useSyncStore((s) => s.rejectionActions);
  const clearRejections = useSyncStore((s) => s.clearRejections);

  const snapPoints = useMemo(() => ["50%", "80%"], []);

  const handleForcePush = useCallback(
    (changeId: string) => {
      Alert.alert(
        "Force Push",
        "This will overwrite the server version with your local changes. Continue?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Force Push",
            style: "destructive",
            onPress: async () => {
              await forcePush?.([changeId]);
              // If no more rejections, close
              if (rejections.length <= 1) {
                clearRejections();
                bottomSheetRef.current?.dismiss();
              }
            },
          },
        ],
      );
    },
    [forcePush, rejections.length, clearRejections, bottomSheetRef],
  );

  const handleDiscard = useCallback(
    (changeId: string) => {
      Alert.alert(
        "Discard Change",
        "This will discard your local change and use the server version. Continue?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: async () => {
              await discard?.([changeId]);
              if (rejections.length <= 1) {
                clearRejections();
                bottomSheetRef.current?.dismiss();
              }
            },
          },
        ],
      );
    },
    [discard, rejections.length, clearRejections, bottomSheetRef],
  );

  const handleBulkForcePush = useCallback(() => {
    const allIds = rejections.map((r) => r.changeId);
    Alert.alert(
      "Force Push All",
      `Force push all ${allIds.length} rejected changes?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Force Push All",
          style: "destructive",
          onPress: async () => {
            await forcePush?.(allIds);
            clearRejections();
            bottomSheetRef.current?.dismiss();
          },
        },
      ],
    );
  }, [rejections, forcePush, clearRejections, bottomSheetRef]);

  const handleBulkDiscard = useCallback(() => {
    const allIds = rejections.map((r) => r.changeId);
    Alert.alert(
      "Discard All",
      `Discard all ${allIds.length} rejected changes?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard All",
          style: "destructive",
          onPress: async () => {
            await discard?.(allIds);
            clearRejections();
            bottomSheetRef.current?.dismiss();
          },
        },
      ],
    );
  }, [rejections, discard, clearRejections, bottomSheetRef]);

  const renderItem = useCallback(
    ({ item }: { item: SyncRejection }) => (
      <View style={[styles.item, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <View style={styles.itemHeader}>
          <MaterialCommunityIcons
            name={item.changeType === "note" ? "note-text" : "folder"}
            size={16}
            color={themeColors.muted}
          />
          <Text style={[styles.itemType, { color: themeColors.foreground }]} numberOfLines={1}>
            {item.changeType} / {item.changeAction}
          </Text>
          <View style={[styles.reasonBadge, { backgroundColor: `${themeColors.destructive}1A` }]}>
            <Text style={[styles.reasonText, { color: themeColors.destructive }]}>
              {rejectionLabel(item.reason)}
            </Text>
          </View>
        </View>
        <Text style={[styles.itemMessage, { color: themeColors.muted }]} numberOfLines={2}>
          {item.message}
        </Text>
        <View style={styles.itemActions}>
          <Pressable
            style={[styles.actionButton, { borderColor: themeColors.primary }]}
            onPress={() => handleForcePush(item.changeId)}
            accessibilityRole="button"
          >
            <Text style={[styles.actionText, { color: themeColors.primary }]}>Force Push</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, { borderColor: themeColors.destructive }]}
            onPress={() => handleDiscard(item.changeId)}
            accessibilityRole="button"
          >
            <Text style={[styles.actionText, { color: themeColors.destructive }]}>Discard</Text>
          </Pressable>
        </View>
      </View>
    ),
    [themeColors, handleForcePush, handleDiscard],
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      backgroundStyle={{ backgroundColor: themeColors.background }}
      handleIndicatorStyle={{ backgroundColor: themeColors.muted }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
      )}
    >
      <BottomSheetView style={styles.container}>
        <Text style={[styles.title, { color: themeColors.foreground }]}>
          Sync Issues ({rejections.length})
        </Text>

        {rejections.length > 1 ? (
          <View style={styles.bulkActions}>
            <Pressable
              style={[styles.bulkButton, { backgroundColor: themeColors.primary }]}
              onPress={handleBulkForcePush}
              accessibilityRole="button"
            >
              <Text style={styles.bulkButtonText}>Force Push All</Text>
            </Pressable>
            <Pressable
              style={[styles.bulkButton, { backgroundColor: themeColors.destructive }]}
              onPress={handleBulkDiscard}
              accessibilityRole="button"
            >
              <Text style={styles.bulkButtonText}>Discard All</Text>
            </Pressable>
          </View>
        ) : null}

        <FlatList
          data={rejections}
          keyExtractor={(item) => item.changeId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  bulkActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  bulkButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  bulkButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  list: {
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  item: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  itemType: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  reasonBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reasonText: {
    fontSize: 11,
    fontWeight: "600",
  },
  itemMessage: {
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  itemActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
