import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { NoteVersion } from "@derekentringer/ns-shared";
import { useThemeColors, type ThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { relativeTimeVerbose } from "@/lib/time";
import { diffLines, diffStats } from "@/lib/diff";

interface VersionHistorySheetProps {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  versions: NoteVersion[];
  isLoading: boolean;
  /** Current note title — used for the diff stats summary on each
   *  row. */
  currentTitle: string;
  /** Current note content — used for the diff stats summary on each
   *  row. */
  currentContent: string;
  /** Tapping a row dismisses the sheet and asks the host screen to
   *  open the diff view for that version. */
  onSelectVersion: (versionId: string) => void;
}

function formatFullTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString();
}

function originLabel(origin: string): string {
  if (!origin) return "Edit";
  // Quick humanization: snake/kebab → Title Case.
  return origin
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export function VersionHistorySheet({
  bottomSheetRef,
  versions,
  isLoading,
  currentTitle,
  currentContent,
  onSelectVersion,
}: VersionHistorySheetProps) {
  const themeColors = useThemeColors();

  // Pre-compute diff stats for each version against the current
  // note. Memoized so the FlatList row factory doesn't re-run the
  // O(n*m) LCS on every render.
  const statsByVersion = useMemo(() => {
    const map = new Map<string, { added: number; removed: number }>();
    for (const v of versions) {
      const stats = diffStats(diffLines(v.content, currentContent));
      map.set(v.id, stats);
    }
    return map;
  }, [versions, currentContent]);

  const handlePress = useCallback(
    (versionId: string) => {
      bottomSheetRef.current?.dismiss();
      onSelectVersion(versionId);
    },
    [bottomSheetRef, onSelectVersion],
  );

  const renderItem = useCallback(
    ({ item }: { item: NoteVersion }) => {
      const stats = statsByVersion.get(item.id) ?? { added: 0, removed: 0 };
      const titleChanged = item.title !== currentTitle;
      return (
        <VersionRow
          version={item}
          stats={stats}
          titleChanged={titleChanged}
          themeColors={themeColors}
          onPress={() => handlePress(item.id)}
        />
      );
    },
    [statsByVersion, currentTitle, themeColors, handlePress],
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["60%", "90%"]}
      backgroundStyle={{ backgroundColor: themeColors.background }}
      handleIndicatorStyle={{ backgroundColor: themeColors.muted }}
      backdropComponent={(props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior="close"
        />
      )}
    >
      {isLoading ? (
        <BottomSheetView style={styles.content}>
          <View style={styles.header}>
            <MaterialCommunityIcons
              name="history"
              size={20}
              color={themeColors.primary}
            />
            <Text style={[styles.title, { color: themeColors.foreground }]}>
              Version History
            </Text>
          </View>
          <ActivityIndicator
            size="large"
            color={themeColors.primary}
            style={styles.loader}
          />
        </BottomSheetView>
      ) : versions.length === 0 ? (
        <BottomSheetView style={styles.content}>
          <View style={styles.header}>
            <MaterialCommunityIcons
              name="history"
              size={20}
              color={themeColors.primary}
            />
            <Text style={[styles.title, { color: themeColors.foreground }]}>
              Version History
            </Text>
          </View>
          <Text style={[styles.emptyText, { color: themeColors.muted }]}>
            No versions available
          </Text>
        </BottomSheetView>
      ) : (
        <BottomSheetFlatList
          data={versions}
          keyExtractor={(item: NoteVersion) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <MaterialCommunityIcons
                name="history"
                size={20}
                color={themeColors.primary}
              />
              <Text style={[styles.title, { color: themeColors.foreground }]}>
                Version History
              </Text>
            </View>
          }
        />
      )}
    </BottomSheetModal>
  );
}

interface VersionRowProps {
  version: NoteVersion;
  stats: { added: number; removed: number };
  titleChanged: boolean;
  themeColors: ThemeColors;
  onPress: () => void;
}

function VersionRow({
  version,
  stats,
  titleChanged,
  themeColors,
  onPress,
}: VersionRowProps) {
  const noChanges = stats.added === 0 && stats.removed === 0;
  return (
    <Pressable
      style={[
        styles.versionItem,
        {
          backgroundColor: themeColors.card,
          borderColor: themeColors.border,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Compare version from ${formatFullTimestamp(version.createdAt)}`}
    >
      <View style={styles.versionInfo}>
        <Text
          style={[styles.versionTitle, { color: themeColors.foreground }]}
          numberOfLines={1}
        >
          {version.title || "Untitled"}
        </Text>
        <Text
          style={[styles.versionTimestamp, { color: themeColors.muted }]}
          numberOfLines={1}
        >
          {formatFullTimestamp(version.createdAt)}
          {"  ·  "}
          {relativeTimeVerbose(version.createdAt)}
        </Text>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.originBadge,
              { backgroundColor: themeColors.input, borderColor: themeColors.border },
            ]}
          >
            <Text style={[styles.originText, { color: themeColors.muted }]}>
              {originLabel(version.origin)}
            </Text>
          </View>
          {titleChanged ? (
            <View
              style={[
                styles.titleChangedBadge,
                { backgroundColor: `${themeColors.warning}1A` },
              ]}
            >
              <Text style={[styles.titleChangedText, { color: themeColors.warning }]}>
                Title changed
              </Text>
            </View>
          ) : null}
          {noChanges ? (
            <Text style={[styles.statsText, { color: themeColors.muted }]}>
              No changes
            </Text>
          ) : (
            <Text style={styles.statsText}>
              {stats.added > 0 ? (
                <Text style={{ color: "#4ade80" }}>+{stats.added}</Text>
              ) : null}
              {stats.added > 0 && stats.removed > 0 ? " " : null}
              {stats.removed > 0 ? (
                <Text style={{ color: "#f87171" }}>−{stats.removed}</Text>
              ) : null}
            </Text>
          )}
        </View>
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={20}
        color={themeColors.muted}
      />
    </Pressable>
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
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  list: {
    paddingHorizontal: spacing.md,
  },
  versionItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  versionInfo: {
    flex: 1,
  },
  versionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  versionTimestamp: {
    fontSize: 12,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  originBadge: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  originText: {
    fontSize: 11,
    fontWeight: "500",
  },
  titleChangedBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  titleChangedText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statsText: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "monospace",
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
