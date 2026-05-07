import React, { useCallback, useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
} from "react-native";
import { useAppAlert } from "@/components/AppAlertProvider";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Clipboard from "expo-clipboard";
import Markdown, { MarkdownIt } from "react-native-markdown-display";
import { markdownRules, TocCaptureContext } from "@/lib/markdownRules";
import { extractHeadings, type MobileHeading } from "@/lib/extractHeadings";
import { TocSheet } from "@/components/notes/TocSheet";
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
  useUpdateNote,
  useAllNotesForWikiLinks,
} from "@/hooks/useNotes";
import {
  resolveWikiLinks,
  parseWikiLinkUrl,
  parseBrokenWikiLinkUrl,
} from "@/lib/resolveWikiLinks";
import {
  markTasks,
  toggleTask,
  parseTaskUrl,
} from "@/lib/toggleTask";
import { useBacklinks } from "@/hooks/useBacklinks";
import { useVersions } from "@/hooks/useVersions";
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

// MarkdownIt instance with `linkify: true` so bare URLs (e.g. a
// `https://...` pasted into body text) become tappable. The
// library's default has `typographer: true` and no linkify; we
// preserve typographer and add linkify. Stable module-scope
// instance so the Markdown component's memoization doesn't churn.
const mdParser = MarkdownIt({ typographer: true, linkify: true });

type Props = NativeStackScreenProps<NotesStackParamList, "NoteDetail">;

export function NoteDetailScreen({ route, navigation }: Props) {
  const showAlert = useAppAlert();
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
    return markTasks(
      resolveWikiLinks(stripFrontmatter(note.content), titleToIdMap),
    );
  }, [note?.content, titleToIdMap]);

  const deleteNote = useDeleteNote();
  const toggleFavorite = useToggleFavorite();
  const updateNote = useUpdateNote();

  const handleLinkPress = React.useCallback(
    (url: string) => {
      const wikiNoteId = parseWikiLinkUrl(url);
      if (wikiNoteId) {
        navigation.push("NoteDetail", { noteId: wikiNoteId });
        return false; // we handled it; don't open externally
      }
      const brokenTitle = parseBrokenWikiLinkUrl(url);
      if (brokenTitle) {
        showAlert(
          "Note not found",
          `No note titled "${brokenTitle}" exists.`,
        );
        return false;
      }
      const task = parseTaskUrl(url);
      if (task && note) {
        // toggleTask runs against the *original* unmodified note
        // content (frontmatter + wiki-link syntax intact) so the
        // canonical GFM `- [ ] ` form round-trips through sync.
        const newContent = toggleTask(note.content, task.taskIndex);
        if (newContent !== note.content) {
          updateNote.mutate({ id: note.id, data: { content: newContent } });
        }
        return false;
      }
      return true; // let the lib open external URLs
    },
    [navigation, showAlert, note, updateNote],
  );
  const { data: backlinksData } = useBacklinks(noteId);
  const {
    data: versionsData,
    isLoading: isLoadingVersions,
  } = useVersions(noteId);
  const { data: foldersData } = useFolders();

  const resolvedFolderName =
    findFolderName(foldersData?.folders ?? [], note?.folderId) || note?.folder || null;

  const versionSheetRef = useRef<BottomSheetModal>(null);
  const tocSheetRef = useRef<BottomSheetModal>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  // ToC capture baseline — wraps every child of the ScrollView so
  // its window-Y moves with the scroll. The heading-capture math
  // subtracts this baseline's Y from each heading's window-Y to
  // get the heading's offset within the scrollable content. See
  // TocCaptureContext docs in markdownRules.ts.
  const contentRef = useRef<View>(null);
  const [showOverflow, setShowOverflow] = useState(false);

  // Phase 4 — Table of Contents capture.
  // Source-derived heading list (used by the bottom sheet) and a
  // map of cleaned-text → rendered Y offset (filled in by the
  // markdown rules' onLayout). Keyed by text since the renderer
  // doesn't carry source-line info; duplicate headings collapse,
  // last-rendered-wins.
  const headings = React.useMemo<MobileHeading[]>(() => {
    if (!note?.content) return [];
    return extractHeadings(stripFrontmatter(note.content));
  }, [note?.content]);
  const headingPositionsRef = useRef<Map<string, number>>(new Map());
  // Reset positions whenever content changes so we don't carry
  // stale Ys across edits. The onLayout callbacks then refill it.
  React.useEffect(() => {
    headingPositionsRef.current = new Map();
  }, [note?.content]);
  const tocCaptureValue = React.useMemo(
    () => ({
      registerHeading(text: string, y: number) {
        headingPositionsRef.current.set(text, y);
      },
      contentRef,
    }),
    [],
  );
  const handleTocPress = useCallback(() => {
    tocSheetRef.current?.present();
  }, []);
  const handleSelectHeading = useCallback(
    (heading: MobileHeading) => {
      const y = headingPositionsRef.current.get(heading.text);
      if (y !== undefined) {
        scrollViewRef.current?.scrollTo({ y, animated: true });
      }
    },
    [],
  );

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
    showAlert(
      "Move to Trash",
      note?.title?.trim() || "Untitled",
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
  }, [noteId, note, deleteNote, navigation, showAlert]);

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

  const handleSelectVersion = useCallback(
    (versionId: string) => {
      navigation.push("NoteDiff", { noteId, versionId });
    },
    [noteId, navigation],
  );

  // Header actions
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          {headings.length > 0 ? (
            <Pressable
              onPress={handleTocPress}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel="Open table of contents"
            >
              <MaterialCommunityIcons
                name="format-list-bulleted"
                size={24}
                color={themeColors.foreground}
                style={styles.headerIcon}
              />
            </Pressable>
          ) : null}
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
              style={styles.headerIcon}
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
              style={styles.headerIcon}
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
              style={styles.headerIcon}
            />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, noteId, note?.favorite, themeColors, handleToggleFavorite, handleCopyLink, handleTocPress, headings.length]);

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
      // Custom key consumed by markdownRules.link for `#wiki-broken:`
      // URLs (mirrors web's `.wiki-link-broken` muted style).
      link_wiki_broken: { color: themeColors.muted },
      // Empty task checkbox glyph — muted color to differentiate
      // from a checked box (which uses the lime primary).
      link_task_empty: { color: themeColors.muted },
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
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={themeColors.primary}
          />
        }
      >
        <View ref={contentRef} collapsable={false}>
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
                          { color: themeColors.tagText },
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
            <TocCaptureContext.Provider value={tocCaptureValue}>
              <Markdown
                style={mdStyles}
                rules={markdownRules}
                onLinkPress={handleLinkPress}
                markdownit={mdParser}
              >
                {renderedContent}
              </Markdown>
            </TocCaptureContext.Provider>
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
        </View>
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
        currentTitle={note?.title ?? ""}
        currentContent={note?.content ?? ""}
        onSelectVersion={handleSelectVersion}
      />
      <TocSheet
        bottomSheetRef={tocSheetRef}
        headings={headings}
        onSelectHeading={handleSelectHeading}
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
  // Inter-item spacing follows platform conventions: 0 on iOS so the
  // bar-button pill renders as a single segmented group; 4dp on Android
  // per Material 3 top-app-bar action-item spacing.
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    ...Platform.select({ ios: { gap: 0 }, default: { gap: 4 } }),
  },
  // 24dp icon in a 48dp touch target on Android (Material 3 spec) and
  // 44pt on iOS (HIG). Keep alignItems/justifyContent: center so the
  // glyph sits in the middle of the touch area regardless.
  headerButton: {
    ...Platform.select({
      ios: { width: 44, height: 44 },
      default: { width: 48, height: 48 },
    }),
    alignItems: "center",
    justifyContent: "center",
  },
  // lineHeight matches icon size — kills the trailing ~4pt of
  // line-box descender that otherwise pushes the glyph below the
  // visual center of the iOS bar-button pill.
  headerIcon: {
    lineHeight: 24,
    ...Platform.select({ ios: { transform: [{ translateY: -4 }] } }),
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
