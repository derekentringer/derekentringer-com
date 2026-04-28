// Phase A.2 (mobile parity): AI chat with tools, citations, and pills.
//
// Builds on A.1's streaming foundation. Now handles:
//   - tool_activity events (shown as "Searching notes…" while
//     the assistant message is still empty)
//   - note_cards events (clickable pills below an assistant turn,
//     first 5 visible + Show N more for the rest)
//   - sources events (Q&A "Related notes:" pills, same overflow
//     pattern, filtered to titles actually cited in the prose)
//   - inline citation markers via tokenizeCitations — title text and
//     superscript number both clickable, navigate to NoteDetail
//   - open_note SSE side-channel: navigate to the note immediately
//     when Claude calls the open_note tool
//
// Slash commands (A.3), confirmation cards (A.4), persistence (A.5),
// and AI settings (A.6) are still ahead.

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useThemeColors } from "@/theme/colors";
import { spacing } from "@/theme";
import { askQuestion, type NoteCard } from "@/api/ai";
import {
  tokenizeCitations,
  type CitationSource,
  type CitationToken,
} from "@/lib/linkifyCitations";
import type { AiStackParamList } from "@/navigation/types";
import type { QASource } from "@derekentringer/ns-shared";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: QASource[];
  noteCards?: NoteCard[];
  toolActivity?: string | null;
  failed?: boolean;
}

const PILL_LIMIT = 5;

type AiNav = NativeStackNavigationProp<AiStackParamList, "AiHome">;

export function AiScreen() {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AiNav>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  const openNote = useCallback(
    (noteId: string) => {
      navigation.navigate("NoteDetail", { noteId });
    },
    [navigation],
  );

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question || isStreaming) return;

    setInput("");
    setIsStreaming(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);
    scrollToBottom();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const event of askQuestion(question, controller.signal)) {
        if (controller.signal.aborted) break;

        // open_note is a side-channel: route immediately to the note
        // and let the message reducer keep doing its thing.
        if (event.openNote) {
          openNote(event.openNote.id);
        }

        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (!last || last.role !== "assistant") return prev;

          let next = last;
          if (event.text) {
            next = {
              ...next,
              content: next.content + event.text,
              // Clear the activity indicator once real prose lands.
              toolActivity: null,
            };
          }
          if (event.error) {
            next = { ...next, content: event.error, failed: true };
          }
          if (event.tool) {
            next = { ...next, toolActivity: event.tool.description };
          }
          if (event.sources && event.sources.length > 0) {
            const existing = next.sources ?? [];
            const merged = [
              ...existing,
              ...event.sources.filter(
                (s) => !existing.some((e) => e.id === s.id),
              ),
            ];
            next = { ...next, sources: merged };
          }
          if (event.noteCards && event.noteCards.length > 0) {
            const existing = next.noteCards ?? [];
            const merged = [
              ...existing,
              ...event.noteCards.filter(
                (c) => !existing.some((e) => e.id === c.id),
              ),
            ];
            next = { ...next, noteCards: merged };
          }

          updated[updated.length - 1] = next;
          return updated;
        });
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const message =
          err instanceof Error ? err.message : "Something went wrong.";
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant" && !last.content) {
            updated[updated.length - 1] = {
              ...last,
              content: message,
              failed: true,
            };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, scrollToBottom, openNote]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleClear = useCallback(() => {
    if (isStreaming) abortRef.current?.abort();
    setMessages([]);
  }, [isStreaming]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <Text style={[styles.headerTitle, { color: themeColors.foreground }]}>
          AI Assistant
        </Text>
        {messages.length > 0 && (
          <Pressable onPress={handleClear} hitSlop={8}>
            <Text style={[styles.headerAction, { color: themeColors.muted }]}>
              Clear
            </Text>
          </Pressable>
        )}
      </View>

      {messages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: themeColors.foreground }]}>
            Ask anything about your notes
          </Text>
          <Text style={[styles.emptyHint, { color: themeColors.muted }]}>
            Try &quot;summarize my recent meeting notes&quot; or
            &quot;what notes do I have about React?&quot;
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, idx) => `msg-${idx}`}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isStreaming={isStreaming}
              onOpenNote={openNote}
            />
          )}
          contentContainerStyle={styles.list}
          onContentSizeChange={scrollToBottom}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <View
        style={[
          styles.composer,
          {
            borderTopColor: themeColors.border,
            backgroundColor: themeColors.card,
          },
        ]}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask, search, create, or organize..."
          placeholderTextColor={themeColors.muted}
          multiline
          editable={!isStreaming}
          style={[
            styles.input,
            {
              color: themeColors.foreground,
              backgroundColor: themeColors.input,
              borderColor: themeColors.border,
            },
          ]}
        />
        <Pressable
          onPress={isStreaming ? handleStop : handleSend}
          disabled={!isStreaming && input.trim().length === 0}
          style={({ pressed }) => [
            styles.sendBtn,
            {
              backgroundColor: isStreaming
                ? themeColors.destructive
                : themeColors.primary,
              opacity:
                pressed || (!isStreaming && input.trim().length === 0)
                  ? 0.6
                  : 1,
            },
          ]}
        >
          <Text style={styles.sendBtnText}>
            {isStreaming ? "Stop" : "Send"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── MessageBubble ───────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message;
  isStreaming: boolean;
  onOpenNote: (noteId: string) => void;
}

function MessageBubble({
  message,
  isStreaming,
  onOpenNote,
}: MessageBubbleProps) {
  const themeColors = useThemeColors();
  const isUser = message.role === "user";

  // Build the citation pool from sources + noteCards so the renderer
  // knows which titles to linkify in the prose.
  const pool = useMemo<CitationSource[]>(() => {
    return [
      ...(message.sources ?? []).map((s) => ({ id: s.id, title: s.title })),
      ...(message.noteCards ?? []).map((c) => ({ id: c.id, title: c.title })),
    ];
  }, [message.sources, message.noteCards]);

  const tokens = useMemo<CitationToken[]>(() => {
    if (isUser || !message.content) return [];
    return tokenizeCitations(message.content, message.sources, message.noteCards);
  }, [isUser, message.content, message.sources, message.noteCards]);

  // Q&A sources: only show pills for titles actually cited in the
  // prose. (Mirrors the desktop/web behavior.)
  const citedSourceIds = useMemo(() => {
    if (!message.sources || message.sources.length === 0) return new Set<string>();
    const cited = new Set<string>();
    for (const t of tokens) {
      if (t.kind === "title" || t.kind === "marker") {
        cited.add(t.noteId);
      }
    }
    return cited;
  }, [tokens, message.sources]);

  const filteredSources = useMemo(() => {
    return (message.sources ?? []).filter((s) => citedSourceIds.has(s.id));
  }, [message.sources, citedSourceIds]);

  return (
    <View
      style={[
        styles.bubbleRow,
        { justifyContent: isUser ? "flex-end" : "flex-start" },
      ]}
    >
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? themeColors.input : themeColors.card,
            borderColor: message.failed
              ? themeColors.destructive
              : themeColors.border,
            maxWidth: isUser ? "85%" : "95%",
          },
        ]}
      >
        {/* Empty-but-streaming placeholder. Show the tool activity if
            we have one, otherwise a generic spinner. */}
        {message.content.length === 0 && !isUser ? (
          <View style={styles.activityRow}>
            <ActivityIndicator size="small" color={themeColors.muted} />
            <Text
              style={[styles.activityText, { color: themeColors.muted }]}
              numberOfLines={1}
            >
              {message.toolActivity ?? (isStreaming ? "Thinking…" : "")}
            </Text>
          </View>
        ) : isUser ? (
          <Text
            style={[styles.bubbleText, { color: themeColors.foreground }]}
          >
            {message.content}
          </Text>
        ) : (
          <CitationText
            tokens={tokens}
            failed={message.failed === true}
            onOpenNote={onOpenNote}
          />
        )}

        {!isUser && filteredSources.length > 0 && (
          <PillList
            label="Related notes:"
            items={filteredSources.map((s) => ({ id: s.id, title: s.title }))}
            onTap={onOpenNote}
            testID="source-pill"
          />
        )}

        {!isUser && message.noteCards && message.noteCards.length > 0 && (
          <PillList
            items={message.noteCards.map((c) => ({
              id: c.id,
              title: c.title,
              folder: c.folder,
            }))}
            onTap={onOpenNote}
            testID="note-card"
          />
        )}
      </View>
      {/* Suppresses unused-pool lint when no rich tokens emit. */}
      {pool.length === 0 && null}
    </View>
  );
}

// ─── CitationText ────────────────────────────────────────────────

function CitationText({
  tokens,
  failed,
  onOpenNote,
}: {
  tokens: CitationToken[];
  failed: boolean;
  onOpenNote: (noteId: string) => void;
}) {
  const themeColors = useThemeColors();
  const baseColor = failed ? themeColors.destructive : themeColors.foreground;

  if (tokens.length === 0) return null;

  return (
    <Text style={[styles.bubbleText, { color: baseColor }]}>
      {tokens.map((t, i) => {
        if (t.kind === "text") {
          return <Text key={`t-${i}`}>{t.text}</Text>;
        }
        if (t.kind === "title") {
          return (
            <Text
              key={`title-${i}`}
              onPress={() => onOpenNote(t.noteId)}
              style={[styles.citationTitle, { color: themeColors.primary }]}
              testID="citation-title"
            >
              {t.text}
            </Text>
          );
        }
        // Marker — small superscript number.
        return (
          <Text
            key={`m-${i}`}
            onPress={() => onOpenNote(t.noteId)}
            style={[styles.citationMarker, { color: themeColors.primary }]}
            testID="citation-marker"
          >
            {` ${t.index}`}
          </Text>
        );
      })}
    </Text>
  );
}

// ─── PillList (note cards / source pills) ────────────────────────

interface Pill {
  id: string;
  title: string;
  folder?: string;
}

function PillList({
  label,
  items,
  onTap,
  testID,
}: {
  label?: string;
  items: Pill[];
  onTap: (id: string) => void;
  testID?: string;
}) {
  const themeColors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, PILL_LIMIT);
  const overflow = items.length - PILL_LIMIT;

  return (
    <View style={[styles.pillSection, { borderTopColor: themeColors.border }]}>
      {label && (
        <Text style={[styles.pillLabel, { color: themeColors.muted }]}>
          {label}
        </Text>
      )}
      {visible.map((pill) => (
        <Pressable
          key={pill.id}
          onPress={() => onTap(pill.id)}
          testID={testID}
          style={({ pressed }) => [
            styles.pill,
            {
              backgroundColor: themeColors.card,
              borderColor: themeColors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={[styles.pillTitle, { color: themeColors.foreground }]}
            numberOfLines={1}
          >
            {pill.title}
          </Text>
          {pill.folder && (
            <Text style={[styles.pillFolder, { color: themeColors.muted }]}>
              {pill.folder}
            </Text>
          )}
        </Pressable>
      ))}
      {overflow > 0 && (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          hitSlop={8}
          style={styles.showMore}
        >
          <Text style={[styles.showMoreText, { color: themeColors.muted }]}>
            {expanded ? "Show fewer" : `Show ${overflow} more`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: "600" },
  headerAction: { fontSize: 13 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  emptyHint: { fontSize: 13, textAlign: "center" },
  list: { padding: spacing.md, gap: spacing.sm },
  bubbleRow: { flexDirection: "row", marginBottom: spacing.sm },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  activityText: { fontSize: 13, flex: 1 },
  citationTitle: { fontWeight: "500" },
  citationMarker: { fontSize: 11, fontWeight: "600" },
  pillSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.xs,
  },
  pillLabel: { fontSize: 11, marginBottom: spacing.xs },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
  },
  pillTitle: { fontSize: 13, fontWeight: "500", flex: 1 },
  pillFolder: { fontSize: 11 },
  showMore: { paddingVertical: spacing.xs, alignItems: "flex-start" },
  showMoreText: { fontSize: 12 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    fontSize: 14,
  },
  sendBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: { color: "white", fontSize: 14, fontWeight: "600" },
});
