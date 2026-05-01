import React, { useCallback, useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Animated,
  StyleSheet,
} from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Clipboard from "expo-clipboard";
import Markdown from "react-native-markdown-display";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NotesStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { formatCreatedDate, formatModifiedDate } from "@/lib/time";
import {
  useNote,
  useDeleteNote,
  useToggleFavorite,
  useAllNotesForWikiLinks,
} from "@/hooks/useNotes";
import {
  resolveWikiLinks,
  parseWikiLinkUrl,
} from "@/lib/resolveWikiLinks";
import { useBacklinks } from "@/hooks/useBacklinks";
import { useVersions, useRestoreVersion } from "@/hooks/useVersions";
import { BacklinksSection } from "@/components/notes/BacklinksSection";
import { VersionHistorySheet } from "@/components/notes/VersionHistorySheet";
import { ErrorCard } from "@/components/common/ErrorCard";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import { SummaryBanner } from "@/components/notes/SummaryBanner";
import { useClampedRows } from "@/hooks/useClampedRows";
import { cardAnimDuration, cardAnimEasing } from "@/lib/animations";
import { stripFrontmatter } from "@derekentringer/ns-shared";
import { useFolders } from "@/hooks/useFolders";
import { findFolderName } from "@/lib/folders";
import { manualSync } from "@/lib/syncEngine";

type Props = NativeStackScreenProps<NotesStackParamList, "NoteDetail">;

export function NoteDetailScreen({ route, navigation }: Props) {
  const { noteId } = route.params;
  const themeColors = useThemeColors();

  const { data: note, isLoading, isError, refetch, isRefetching } = useNote(noteId);
  // Title → noteId map for `[[wiki-link]]` resolution. Cached
  // with a long staleTime since note titles don't change often.
  const { data: allNotes } = useAllNotesForWikiLinks();
  const titleToIdMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const n of allNotes ?? []) {
      if (n.deletedAt) continue;
      if (n.title) map.set(n.title.toLowerCase(), n.id);
    }
    return map;
  }, [allNotes]);
  const renderedContent = React.useMemo(() => {
    if (!note?.content) return "";
    return resolveWikiLinks(stripFrontmatter(note.content), titleToIdMap);
  }, [note?.content, titleToIdMap]);
  const handleLinkPress = React.useCallback(
    (url: string) => {
      const wikiNoteId = parseWikiLinkUrl(url);
      if (wikiNoteId) {
        navigation.push("NoteDetail", { noteId: wikiNoteId });
        return false; // we handled it; don't open externally
      }
      return true; // let the lib open external URLs
    },
    [navigation],
  );
  const { data: backlinksData } = useBacklinks(noteId);
  const {
    data: versionsData,
    isLoading: isLoadingVersions,
  } = useVersions(noteId);
  const { data: foldersData } = useFolders();

  const resolvedFolderName =
    findFolderName(foldersData?.folders ?? [], note?.folderId) || note?.folder || null;

  const deleteNote = useDeleteNote();
  const toggleFavorite = useToggleFavorite();
  const restoreVersion = useRestoreVersion();

  const versionSheetRef = useRef<BottomSheetModal>(null);
  const [showOverflow, setShowOverflow] = useState(false);

  // Clamp the read-only tag list to 2 rows; tapping the card
  // expands. Mirrors the editor's TagInput pattern: the inner
  // chip wrap has no border/padding (chrome = 0), and the parent
  // card owns the chrome.
  const tagsClamp = useClampedRows({
    itemCount: note?.tags.length ?? 0,
    maxLines: 2,
    rowGap: 6,
    chrome: 0,
  });

  const tagsRotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(tagsRotate, {
      toValue: tagsClamp.expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [tagsClamp.expanded, tagsRotate]);
  const tagsChevronRotation = tagsRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });

  const tagsMaxH = useRef(new Animated.Value(9999)).current;
  const tagsInitRef = useRef(false);
  useEffect(() => {
    if (
      tagsClamp.naturalHeight === null ||
      tagsClamp.collapsedHeight === null
    ) {
      return;
    }
    const target = !tagsClamp.hasOverflow
      ? tagsClamp.naturalHeight
      : tagsClamp.expanded
        ? tagsClamp.naturalHeight
        : tagsClamp.collapsedHeight;
    if (!tagsInitRef.current) {
      tagsInitRef.current = true;
      tagsMaxH.setValue(target);
      return;
    }
    Animated.timing(tagsMaxH, {
      toValue: target,
      duration: cardAnimDuration,
      easing: cardAnimEasing,
      useNativeDriver: false,
    }).start();
  }, [
    tagsClamp.expanded,
    tagsClamp.hasOverflow,
    tagsClamp.collapsedHeight,
    tagsClamp.naturalHeight,
    tagsMaxH,
  ]);

  // Refetch when screen regains focus (e.g. returning from editor)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const handleToggleFavorite = useCallback(async () => {
    if (!note) return;
    await toggleFavorite.mutateAsync({
      id: note.id,
      favorite: !note.favorite,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [note, toggleFavorite]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Move to Trash",
      "Move this note to Trash?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Move to Trash",
          style: "destructive",
          onPress: async () => {
            await deleteNote.mutateAsync({ id: noteId });
            navigation.goBack();
          },
        },
      ],
    );
  }, [noteId, deleteNote, navigation]);

  const handleCopyLink = useCallback(async () => {
    const url = `https://ns.derekentringer.com/notes/${noteId}`;
    await Clipboard.setStringAsync(url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [noteId]);

  const handleRefresh = useCallback(async () => {
    manualSync();
    await refetch();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [refetch]);

  const handleBacklinkPress = useCallback(
    (backlinkNoteId: string) => {
      navigation.push("NoteDetail", { noteId: backlinkNoteId });
    },
    [navigation],
  );

  const handleRestoreVersion = useCallback(
    async (versionId: string) => {
      await restoreVersion.mutateAsync({ noteId, versionId });
      versionSheetRef.current?.dismiss();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [noteId, restoreVersion],
  );

  // Header actions
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => navigation.navigate("NoteEditor", { noteId })}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Edit note"
          >
            <MaterialCommunityIcons
              name="pencil-outline"
              size={24}
              color={themeColors.foreground}
            />
          </Pressable>
          <Pressable
            onPress={handleToggleFavorite}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={note?.favorite ? "Remove from favorites" : "Add to favorites"}
          >
            <MaterialCommunityIcons
              name={note?.favorite ? "star" : "star-outline"}
              size={24}
              color={note?.favorite ? themeColors.primary : themeColors.foreground}
            />
          </Pressable>
          <Pressable
            onPress={() => setShowOverflow((p) => !p)}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <MaterialCommunityIcons
              name="dots-vertical"
              size={24}
              color={themeColors.foreground}
            />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, noteId, note?.favorite, themeColors, handleToggleFavorite, handleCopyLink]);

  const mdStyles = React.useMemo(
    () => ({
      body: { color: themeColors.foreground, fontSize: 15, lineHeight: 22 },
      // Heading styles mirror ns-web's `.markdown-preview h{1..3}`:
      //   h1/h2 use the primary (lime) accent + a top margin for
      //   breathing room above; h3 uses foreground. The previous
      //   styles were foreground-only with no marginTop, so headings
      //   collided with the prior paragraph and didn't pop visually.
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
      code_block: {
        backgroundColor: themeColors.card,
        borderRadius: 8,
        padding: 12,
        color: themeColors.foreground,
      },
      fence: {
        backgroundColor: themeColors.card,
        borderRadius: 8,
        padding: 12,
        color: themeColors.foreground,
      },
      blockquote: {
        backgroundColor: themeColors.card,
        borderLeftWidth: 3,
        borderLeftColor: themeColors.primary,
        paddingHorizontal: 12,
        paddingVertical: 4,
      },
      link: { color: themeColors.primary },
      // Web's `.markdown-preview hr` uses a 1px top border + 1.5em
      // vertical margin. RN's react-native-markdown-display renders
      // hr as a View, so we need explicit height + margins —
      // backgroundColor alone gave us a 0-height invisible rule.
      hr: {
        backgroundColor: themeColors.border,
        height: 1,
        marginTop: 24,
        marginBottom: 24,
      },
    }),
    [themeColors],
  );

  if (isLoading) {
    return (
      <View
        style={[styles.container, { backgroundColor: themeColors.background }]}
      >
        <View style={styles.loadingContainer}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={5} style={{ marginTop: spacing.md }} />
        </View>
      </View>
    );
  }

  if (isError || !note) {
    return (
      <View
        style={[styles.container, { backgroundColor: themeColors.background }]}
      >
        <ErrorCard
          message="Failed to load note"
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={themeColors.primary}
          />
        }
      >
        {/* Status line */}
        <Text style={[styles.statusLine, { color: themeColors.muted }]}>
          Saved · Created {formatCreatedDate(note.createdAt)} · Modified {formatModifiedDate(note.updatedAt)}
        </Text>

        {/* Title */}
        <Text style={[styles.title, { color: themeColors.foreground }]}>
          {note.title || "Untitled"}
        </Text>

        {/* Folder + Summary + Tags row — mirrors the editor's
            metaSection so spacing is consistent across screens.
            Order is folder → summary → tags, all separated by
            gap: spacing.sm. */}
        <View style={styles.metaSection}>
          <View
            style={[
              styles.folderBadge,
              { backgroundColor: themeColors.border },
            ]}
          >
            <MaterialCommunityIcons
              name="folder-outline"
              size={12}
              color={themeColors.muted}
            />
            <Text style={[styles.folderText, { color: themeColors.muted }]}>
              {resolvedFolderName || "Unfiled"}
            </Text>
          </View>

          {/* AI summary banner (Phase B.1). Read-only on the
              detail screen, so no delete control — the editor
              handles clearing. */}
          <SummaryBanner summary={note.summary} />

          {note.tags.length > 0 ? (
            <Pressable
              onPress={() => tagsClamp.setExpanded((v) => !v)}
              style={[
                styles.tagsCard,
                {
                  backgroundColor: themeColors.input,
                  borderColor: themeColors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                tagsClamp.expanded ? "Collapse tags" : "Expand tags"
              }
            >
              <View style={styles.tagsHeaderRow}>
                <Animated.View
                  style={{ transform: [{ rotate: tagsChevronRotation }] }}
                >
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={16}
                    color={themeColors.muted}
                  />
                </Animated.View>
                <Text
                  style={[styles.tagsLabel, { color: themeColors.muted }]}
                >
                  Tags
                </Text>
              </View>

              <Animated.View
                style={{ maxHeight: tagsMaxH, overflow: "hidden" }}
              >
                <View
                  style={styles.tagsWrap}
                  onLayout={tagsClamp.handleContainerLayout}
                >
                  {note.tags.map((tag, i) => (
                    <View
                      key={tag}
                      style={[
                        styles.tagChip,
                        { backgroundColor: `${themeColors.primary}1A` },
                      ]}
                      onLayout={
                        i === 0 ? tagsClamp.handleUnitLayout : undefined
                      }
                    >
                      <Text
                        style={[
                          styles.tagText,
                          { color: themeColors.primary },
                        ]}
                      >
                        {tag}
                      </Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            </Pressable>
          ) : null}
        </View>

        {/* Content — frontmatter is stripped before rendering so the
            YAML block doesn't appear as raw text in the preview;
            mirrors web/desktop NotesPage behavior. The metadata is
            still surfaced in the title/tags/dates header above. */}
        <View style={styles.content}>
          {note.content ? (
            <Markdown style={mdStyles} onLinkPress={handleLinkPress}>
              {renderedContent}
            </Markdown>
          ) : (
            <Text style={[styles.emptyContent, { color: themeColors.muted }]}>
              No content
            </Text>
          )}
        </View>

        {/* Backlinks */}
        {backlinksData?.backlinks ? (
          <View style={styles.backlinks}>
            <BacklinksSection
              backlinks={backlinksData.backlinks}
              onPress={handleBacklinkPress}
            />
          </View>
        ) : null}
      </ScrollView>

      {/* Overflow menu */}
      {showOverflow ? (
        <Pressable
          style={styles.overflowBackdrop}
          onPress={() => setShowOverflow(false)}
        >
          <View style={[styles.overflowMenu, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Pressable
              style={styles.overflowItem}
              onPress={() => {
                setShowOverflow(false);
                handleCopyLink();
              }}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="link-variant" size={20} color={themeColors.foreground} />
              <Text style={[styles.overflowText, { color: themeColors.foreground }]}>
                Copy Link
              </Text>
            </Pressable>
            <Pressable
              style={styles.overflowItem}
              onPress={() => {
                setShowOverflow(false);
                versionSheetRef.current?.present();
              }}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="history" size={20} color={themeColors.foreground} />
              <Text style={[styles.overflowText, { color: themeColors.foreground }]}>
                Version History
              </Text>
            </Pressable>
            <Pressable
              style={styles.overflowItem}
              onPress={() => {
                setShowOverflow(false);
                handleDelete();
              }}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="trash-can-outline" size={20} color={themeColors.destructive} />
              <Text style={[styles.overflowText, { color: themeColors.destructive }]}>
                Delete Note
              </Text>
            </Pressable>
          </View>
        </Pressable>
      ) : null}

      {/* Version history sheet */}
      <VersionHistorySheet
        bottomSheetRef={versionSheetRef}
        versions={versionsData?.versions ?? []}
        isLoading={isLoadingVersions}
        onRestore={handleRestoreVersion}
        isRestoring={restoreVersion.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    padding: spacing.md,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  // Material Design 3 top-app-bar action item: 24 dp glyph
  // centered inside a 48 dp touch target via 12 dp padding.
  // The 12 dp internal padding on each button already produces
  // the right visual separation, so the inter-button gap is 0.
  // Source: https://m3.material.io/components/top-app-bar/specs
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  headerButton: {
    padding: 12,
  },
  statusLine: {
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  overflowBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  overflowMenu: {
    position: "absolute",
    top: 4,
    right: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: 4,
    minWidth: 180,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 11,
  },
  overflowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: spacing.sm,
  },
  overflowText: {
    fontSize: 15,
  },
  metaSection: {
    gap: spacing.sm,
  },
  folderBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  folderText: {
    fontSize: 12,
  },
  tagsCard: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  tagsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  tagsLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  tagChip: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 13,
    fontWeight: "500",
  },
  content: {
    marginTop: spacing.sm,
    minHeight: 200,
  },
  emptyContent: {
    fontSize: 15,
    fontStyle: "italic",
  },
  backlinks: {
    paddingHorizontal: 0,
  },
});
