// Phase A.5.1 (mobile parity): cross-device chat refetch.
//
// The mobile sync engine now subscribes to the server's SSE `chat`
// event and bumps useSyncStore.chatRefreshKey when another device
// writes to chat history. AiScreen watches that counter and re-runs
// fetchChatHistory(). The existing isSavingRef + lastSavedRef
// guards prevent a self-echo loop — our own writes briefly set
// isSavingRef true, and even after that flips back, the refetched
// JSON matches lastSavedRef so we no-op.
//
// Phase A.6 (mobile parity): AI settings + auto-approve flags.
//
// AiScreen now reads `autoApprove` from the persisted aiSettings
// store and passes it to every askQuestion call. When a destructive
// tool's flag is true, the backend skips the confirmation gate and
// runs the tool directly — the assistant phrases its reply as
// completed instead of "I've proposed". The Settings tab gets a new
// "AI Assistant" section with a master toggle plus a per-tool
// auto-approve list.
//
// Phase A.5 (mobile parity): chat persistence + history-aware
// follow-ups + /savechat slash command.
//
// On mount: fetchChatHistory() rehydrates prior turns. On every
// messages change: a debounced replaceChatMessages() persists to
// the server (5s steady-state debounce, 200ms fast-flush after a
// streaming turn ends — same shape desktop/web use). Each new
// askQuestion call serializes the prior text turns and passes them
// as `history` so the model has continuity ("the second one", "why
// did you say that").
//
// Phase A.4 (mobile parity): confirmation cards for destructive
// AI tool calls (delete_note, delete_folder, update_note_content,
// rename_note, rename_folder, rename_tag).
//
// When the SSE stream emits a `confirmation` event, the assistant
// turn's bubble grows a ConfirmationCard with Apply / Discard
// buttons. Apply re-runs the tool server-side via /ai/tools/confirm
// (autoApprove=true on that path) and updates the card to "applied"
// or "failed". Discard flips the card to "discarded" without
// touching the server.
//
// Phase A.3 (mobile parity): slash commands.
//
// Builds on A.2's rich-content rendering. Adds the slash-command
// catalog from `lib/chatCommands.ts` plus an inline typeahead picker
// that appears above the composer when input starts with `/`. Tap a
// command → fills the composer with `/<name>` ready for args. On
// send, parseCommand → execute locally → result rendered as an
// assistant message; non-command input falls through to askQuestion
// streaming as before.
//
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  KeyboardChatScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import type { ScrollViewProps } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useThemeColors } from "@/theme/colors";
import { spacing } from "@/theme";
import {
  askQuestion,
  clearServerChatHistory,
  confirmTool,
  fetchChatHistory,
  replaceChatMessages,
  type ChatMessageData,
  type NoteCard,
  type PendingConfirmation,
} from "@/api/ai";
import {
  serializeChatHistory,
  trimChatHistory,
} from "@/lib/chatHistory";
import useAiSettingsStore from "@/store/aiSettingsStore";
import useSyncStore from "@/store/syncStore";
import {
  ConfirmationCard,
  type ConfirmationStatus,
} from "@/components/notes/ConfirmationCard";
import {
  filterCommands,
  parseCommand,
  type ChatCommand,
} from "@/lib/chatCommands";
import {
  tokenizeCitations,
  type CitationToken,
} from "@/lib/linkifyCitations";
import type { AiStackParamList } from "@/navigation/types";
import type { QASource } from "@derekentringer/ns-shared";

interface ItemResult {
  id: string;
  ok: boolean;
  text?: string;
  error?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: QASource[];
  noteCards?: NoteCard[];
  toolActivity?: string | null;
  failed?: boolean;
  /** Phase A.4: when the SSE stream emits a `confirmation` event, the
   *  assistant turn carries one or more pending actions (consecutive
   *  same-tool confirmations merge into a single batched card —
   *  matches desktop's `pendings` array). */
  confirmation?: {
    pendings: PendingConfirmation[];
    status: ConfirmationStatus;
    resultText?: string;
    errorMessage?: string;
    itemResults?: ItemResult[];
  };
}

// ─── Hydration helpers (Phase A.5) ────────────────────────────────

interface PersistedConfirmation {
  /** New shape — array of pendings (batched card). */
  pendings?: PendingConfirmation[];
  /** Legacy shape from pre-batch saves; one pending only. */
  pending?: PendingConfirmation;
  status: ConfirmationStatus;
  resultText?: string;
  errorMessage?: string;
  itemResults?: ItemResult[];
}

function rowsToMessages(rows: ChatMessageData[]): Message[] {
  return rows
    .map<Message | null>((r) => {
      // We only round-trip user / assistant. meeting-summary is a
      // future-shape (mobile doesn't surface them yet — defer to
      // Phase C audio recording follow-up).
      if (r.role !== "user" && r.role !== "assistant") return null;
      const conf = r.confirmation as PersistedConfirmation | undefined;
      let confirmation: Message["confirmation"];
      if (conf) {
        const pendings =
          conf.pendings && conf.pendings.length > 0
            ? conf.pendings
            : conf.pending
              ? [conf.pending]
              : [];
        if (pendings.length > 0) {
          // A persisted "applying" status means we crashed mid-Apply
          // (or another device is mid-Apply) — flip it back to
          // "pending" so the user can re-Apply instead of staring at
          // a forever-spinner.
          const status: ConfirmationStatus =
            conf.status === "applying" ? "pending" : conf.status;
          confirmation = {
            pendings,
            status,
            resultText: conf.resultText,
            errorMessage: conf.errorMessage,
            itemResults: conf.itemResults,
          };
        }
      }
      return {
        role: r.role,
        content: r.content,
        sources: r.sources as QASource[] | undefined,
        noteCards: r.noteCards as NoteCard[] | undefined,
        confirmation,
      };
    })
    .filter((m): m is Message => m !== null)
    // Strip empty assistant placeholders from older saves (any bubble
    // with no content, no card, no confirmation, no failure marker).
    .filter((m) => {
      if (m.role !== "assistant") return true;
      if (m.content) return true;
      if (m.confirmation) return true;
      if (m.noteCards?.length) return true;
      if (m.sources?.length) return true;
      if (m.failed) return true;
      return false;
    });
}

function messagesToRows(messages: Message[]): ChatMessageData[] {
  return messages.map((m) => {
    let confirmation: PersistedConfirmation | undefined;
    if (m.confirmation) {
      // Persist `applying` as `pending` — losing the card on a
      // cross-device refetch was worse than the small risk of a
      // re-Apply prompt; the user can simply tap again.
      const status: ConfirmationStatus =
        m.confirmation.status === "applying" ? "pending" : m.confirmation.status;
      confirmation = {
        pendings: m.confirmation.pendings,
        status,
        resultText: m.confirmation.resultText,
        errorMessage: m.confirmation.errorMessage,
        itemResults: m.confirmation.itemResults,
      };
    }
    return {
      role: m.role,
      content: m.content,
      sources: m.sources,
      noteCards: m.noteCards,
      confirmation,
    };
  });
}

const PILL_LIMIT = 5;

type AiNav = NativeStackNavigationProp<AiStackParamList, "AiHome">;

export function AiScreen() {
  const themeColors = useThemeColors();
  const navigation = useNavigation<AiNav>();
  // KeyboardStickyView translates by the full keyboard height, but
  // our composer's "rest" position sits above the bottom tab bar
  // (the screen content area is inset by tabBarHeight). Without
  // compensation, the composer ends up `tabBarHeight` above the
  // keyboard top instead of flush. Adding tabBarHeight to
  // `offset.opened` cancels that gap so the composer pins to the
  // keyboard top exactly.
  const tabBarHeight = useBottomTabBarHeight();
  const autoApprove = useAiSettingsStore((s) => s.autoApprove);
  const chatRefreshKey = useSyncStore((s) => s.chatRefreshKey);
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

  // ─── Phase A.5: hydration + persistence ──────────────────────
  // Rehydrate the chat from the server on mount so the user lands
  // back into their last conversation. Persisted by the matching
  // effect below whenever messages change. Guarded by
  // historyLoadedRef so the first persistence write doesn't race
  // with the load.
  const historyLoadedRef = useRef(false);
  const lastSavedRef = useRef<string>("");
  const isSavingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    fetchChatHistory()
      .then((rows) => {
        if (rows.length === 0) return;
        const loaded = rowsToMessages(rows);
        setMessages((prev) => {
          // If the user already started typing/sending while hydration
          // was in flight, don't clobber their work — keep what's
          // there and skip the rehydrate. Mark lastSaved so we don't
          // immediately re-write the same value.
          if (prev.length > 0) return prev;
          lastSavedRef.current = JSON.stringify(loaded);
          return loaded;
        });
      })
      .catch(() => {
        // Hydration failure is non-fatal — the user can still chat.
      });
  }, []);

  const persistNow = useCallback(() => {
    if (!historyLoadedRef.current) return;
    const json = JSON.stringify(messages);
    if (json === lastSavedRef.current) return;
    lastSavedRef.current = json;
    isSavingRef.current = true;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    replaceChatMessages(messagesToRows(messages))
      .catch(() => {
        // Non-fatal — next change will retry. Don't roll back
        // lastSavedRef so we don't write the same payload N times.
      })
      .finally(() => {
        setTimeout(() => {
          isSavingRef.current = false;
        }, 500);
      });
  }, [messages]);

  // Steady-state debounce: 5s after the latest mutation, push to
  // the server. Resets every time messages change. Skips writes
  // while a stream is in flight (the post-stream fast-flush effect
  // below picks that up promptly).
  useEffect(() => {
    if (!historyLoadedRef.current) return;
    if (isStreaming) return;
    const json = JSON.stringify(messages);
    if (json === lastSavedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistNow();
    }, 5000);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [messages, isStreaming, persistNow]);

  // Phase A.5.1: react to remote chat-history changes from other
  // devices. The sync engine bumps `chatRefreshKey` when it sees a
  // server-side `chat` SSE event; we re-fetch and swap state.
  // Skip the very first render (chatRefreshKey === 0) — that's just
  // the initial store value, not a real signal.
  useEffect(() => {
    if (chatRefreshKey === 0) return;
    if (!historyLoadedRef.current) return;
    if (isSavingRef.current) return;
    fetchChatHistory()
      .then((rows) => {
        const loaded = rowsToMessages(rows);
        const json = JSON.stringify(loaded);
        // No-op if the server's view matches what we already have.
        if (json === lastSavedRef.current) return;
        lastSavedRef.current = json;
        setMessages(loaded);
      })
      .catch(() => {
        // Non-fatal; next bump will retry.
      });
  }, [chatRefreshKey]);

  // Fast-flush: 200ms after a streaming turn ends, persist promptly
  // so the assistant message survives a quick screen close.
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => persistNow(), 200);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, persistNow]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question || isStreaming) return;

    // Slash command path — execute locally, append the result as an
    // assistant turn, skip the SSE stream entirely.
    const parsed = parseCommand(question);
    if (parsed) {
      setInput("");
      // Show the user's command in the chat for context.
      setMessages((prev) => [...prev, { role: "user", content: question }]);
      scrollToBottom();
      try {
        const result = await parsed.command.execute(parsed.args, {
          clearChat: () => {
            if (abortRef.current) abortRef.current.abort();
            setMessages([]);
          },
          openInTab: openNote,
          getChatMessages: () =>
            messages.map((m) => ({
              role: m.role,
              content: m.content,
              noteCards: m.noteCards,
              sources: m.sources,
            })),
        });
        if (result.silent) return;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.text,
            noteCards: result.noteCards,
          },
        ]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Command failed.";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: message, failed: true },
        ]);
      }
      scrollToBottom();
      return;
    }

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

    // Pass the prior text turns to the model for continuity. We
    // serialize from the messages snapshot BEFORE the user's new
    // question + the empty assistant placeholder we just appended,
    // so the history doesn't contain the in-flight turn.
    const historySnapshot = trimChatHistory(
      serializeChatHistory(messages),
    );

    try {
      for await (const event of askQuestion(
        question,
        controller.signal,
        undefined,
        undefined,
        historySnapshot,
        autoApprove,
      )) {
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

          // Confirmation events: if the most recent card is still
          // pending and uses the same toolName, merge into it (so
          // "delete A and B" renders as one batched card with one
          // Apply CTA — matching desktop). Otherwise insert a new
          // card. Either way, append an empty assistant placeholder
          // so subsequent streamed text lands cleanly.
          if (event.confirmation) {
            const prevMsg = updated[updated.length - 1];
            const prevPrevMsg = updated[updated.length - 2];
            const candidate =
              prevMsg?.confirmation?.status === "pending"
                ? prevMsg
                : prevMsg?.role === "assistant" &&
                    prevMsg.content === "" &&
                    prevPrevMsg?.confirmation?.status === "pending"
                  ? prevPrevMsg
                  : null;
            if (
              candidate?.confirmation &&
              candidate.confirmation.pendings[0]?.toolName ===
                event.confirmation.toolName
            ) {
              const candIdx = updated.indexOf(candidate);
              updated[candIdx] = {
                ...candidate,
                confirmation: {
                  ...candidate.confirmation,
                  pendings: [
                    ...candidate.confirmation.pendings,
                    event.confirmation,
                  ],
                },
              };
            } else {
              updated.push({
                role: "assistant",
                content: "",
                confirmation: {
                  pendings: [event.confirmation],
                  status: "pending",
                },
              });
              updated.push({ role: "assistant", content: "" });
            }
          }
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
  }, [input, isStreaming, scrollToBottom, openNote, messages, autoApprove]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleConfirmApply = useCallback(async (
    idx: number,
    pendings: PendingConfirmation[],
  ) => {
    // Pendings come straight from the call site so we don't have to
    // round-trip through setMessages just to read them (a prior
    // setState-side-effect read was racing with React's deferred
    // updater queue and bailing out of the call entirely).
    setMessages((prev) => {
      const updated = [...prev];
      const target = updated[idx];
      if (!target?.confirmation) return prev;
      updated[idx] = {
        ...target,
        confirmation: { ...target.confirmation, status: "applying" },
      };
      return updated;
    });

    // Apply sequentially; gather per-item results so a partial
    // failure surfaces as "2 of 3 applied" instead of masking
    // either the wins or the losses.
    const itemResults: ItemResult[] = [];
    for (const p of pendings) {
      try {
        const result = await confirmTool(p.toolName, p.toolInput);
        itemResults.push({ id: p.id, ok: true, text: result.text });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Apply failed.";
        itemResults.push({ id: p.id, ok: false, error: message });
      }
    }

    const okCount = itemResults.filter((r) => r.ok).length;
    const allOk = okCount === pendings.length;
    const noneOk = okCount === 0;

    setMessages((prev) => {
      const updated = [...prev];
      const target = updated[idx];
      if (!target?.confirmation) return prev;
      updated[idx] = {
        ...target,
        confirmation: {
          ...target.confirmation,
          status: noneOk ? "failed" : "applied",
          resultText:
            allOk && pendings.length === 1
              ? itemResults[0].text
              : allOk
                ? `All ${pendings.length} actions applied.`
                : `${okCount} of ${pendings.length} applied — ${pendings.length - okCount} failed.`,
          errorMessage: noneOk ? itemResults[0]?.error : undefined,
          itemResults: pendings.length > 1 ? itemResults : undefined,
        },
      };
      return updated;
    });
  }, []);

  const handleConfirmDiscard = useCallback((idx: number) => {
    setMessages((prev) => {
      const updated = [...prev];
      const target = updated[idx];
      if (!target?.confirmation) return prev;
      updated[idx] = {
        ...target,
        confirmation: { ...target.confirmation, status: "discarded" },
      };
      return updated;
    });
  }, []);

  const handleClear = useCallback(() => {
    if (isStreaming) abortRef.current?.abort();
    setMessages([]);
    lastSavedRef.current = "[]";
    // Wipe server history too so a refresh doesn't bring it back.
    clearServerChatHistory().catch(() => {});
  }, [isStreaming]);

  // Mount Clear in the navigator header so we don't render a second
  // "AI Assistant" title inside the screen. Hidden until there's
  // something to clear.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        messages.length > 0 ? (
          <Pressable onPress={handleClear} hitSlop={8}>
            <Text style={[styles.headerAction, { color: themeColors.muted }]}>
              Clear
            </Text>
          </Pressable>
        ) : null,
    });
  }, [navigation, handleClear, messages.length, themeColors.muted]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {messages.length === 0 ? (
        // Empty-state parity with ns-web's AIAssistantPanel:
        // chat-bubble icon at 32px / muted-foreground/40, "Your AI
        // Assistant" title, and the same description string.
        <View style={styles.empty}>
          <MaterialCommunityIcons
            name="message-outline"
            size={32}
            color={themeColors.muted}
            style={styles.emptyIcon}
          />
          <Text style={[styles.emptyTitle, { color: themeColors.muted }]}>
            Your AI Assistant
          </Text>
          <Text style={[styles.emptyHint, { color: themeColors.muted }]}>
            Search, create, and organize notes. Summarize content,
            generate tags, and ask questions during meetings.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, idx) => `msg-${idx}`}
          renderItem={({ item, index }) => (
            <MessageBubble
              message={item}
              messageIndex={index}
              isStreaming={isStreaming}
              onOpenNote={openNote}
              onConfirmApply={handleConfirmApply}
              onConfirmDiscard={handleConfirmDiscard}
            />
          )}
          contentContainerStyle={styles.list}
          onContentSizeChange={scrollToBottom}
          keyboardShouldPersistTaps="handled"
          // KeyboardChatScrollView is the v1.21+ chat-aware
          // scroller from react-native-keyboard-controller — when
          // the keyboard opens, it lifts the content (not just the
          // composer) so the latest message stays visible above
          // the keyboard, and supports interactive swipe-to-
          // dismiss. Drop-in via renderScrollComponent.
          renderScrollComponent={(props: ScrollViewProps) => (
            <KeyboardChatScrollView {...props} />
          )}
        />
      )}

      {/* KeyboardStickyView translates the composer up by the
          keyboard height; offset.opened = tabBarHeight cancels the
          gap that comes from the screen content's tab-bar inset so
          the composer pins flush to the keyboard top. */}
      <KeyboardStickyView offset={{ closed: 0, opened: tabBarHeight }}>
        <SlashCommandPicker
          input={input}
          onPick={(cmd) => {
            setInput(`/${cmd.name}${cmd.usage.includes("[") ? " " : ""}`);
          }}
        />
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
            <Text
              style={[
                // Web parity: Ask uses `text-primary-contrast`
                // (#000000) + `font-medium` on the lime button;
                // Stop uses `text-foreground` (regular weight) on
                // the destructive button. Mobile mirrors that.
                isStreaming ? styles.stopBtnText : styles.askBtnText,
                isStreaming
                  ? { color: themeColors.foreground }
                  : { color: "#000000" },
              ]}
            >
              {isStreaming ? "Stop" : "Ask"}
            </Text>
          </Pressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

// ─── MessageBubble ───────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message;
  messageIndex: number;
  isStreaming: boolean;
  onOpenNote: (noteId: string) => void;
  onConfirmApply: (idx: number, pendings: PendingConfirmation[]) => void;
  onConfirmDiscard: (idx: number) => void;
}

function MessageBubble({
  message,
  messageIndex,
  isStreaming,
  onOpenNote,
  onConfirmApply,
  onConfirmDiscard,
}: MessageBubbleProps) {
  const themeColors = useThemeColors();
  const isUser = message.role === "user";

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

  // Confirmation messages render a card instead of a regular bubble.
  // The bubble itself is suppressed; the card carries its own border
  // and looks like a freestanding action prompt.
  if (message.confirmation) {
    return (
      <View
        style={[
          styles.bubbleRow,
          { justifyContent: "flex-start" },
        ]}
      >
        <View style={styles.confirmationWrap}>
          <ConfirmationCard
            pendings={message.confirmation.pendings}
            status={message.confirmation.status}
            resultText={message.confirmation.resultText}
            errorMessage={message.confirmation.errorMessage}
            itemResults={message.confirmation.itemResults}
            onApply={() => onConfirmApply(messageIndex, message.confirmation!.pendings)}
            onDiscard={() => onConfirmDiscard(messageIndex)}
          />
        </View>
      </View>
    );
  }

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
            backgroundColor: isUser ? themeColors.subtle : themeColors.card,
            borderColor: message.failed
              ? themeColors.destructive
              : themeColors.border,
          },
          // User bubbles shrink-wrap to content (right-aligned, max
          // 92% wide). Assistant bubbles left-align at a fixed 80%
          // of the row so the lane separation reads at a glance —
          // and `width` (not `maxWidth`) forces the bubble to fill
          // its lane so embedded pill lists / tables don't shrink-
          // wrap to the longest title and truncate the rest.
          isUser ? { maxWidth: "92%" } : { width: "80%" },
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
          <UserBubbleText content={message.content} />
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
    </View>
  );
}

// ─── UserBubbleText ──────────────────────────────────────────────

/** Renders a user message. If it starts with a slash command, the
 *  command word renders as a small mono-font code chip styled with
 *  the lime accent (matching desktop/web's `<code class="text-primary
 *  bg-input">` chip). Args after the first space stay as plain
 *  prose. */
function UserBubbleText({ content }: { content: string }) {
  const themeColors = useThemeColors();
  if (content.startsWith("/")) {
    const spaceIdx = content.indexOf(" ");
    const cmd = spaceIdx > 0 ? content.slice(0, spaceIdx) : content;
    const rest = spaceIdx > 0 ? content.slice(spaceIdx + 1) : "";
    return (
      <Text
        style={[styles.bubbleText, { color: themeColors.foreground }]}
      >
        <Text
          style={[
            styles.userCommandChip,
            {
              color: themeColors.primary,
              backgroundColor: themeColors.input,
            },
          ]}
        >
          {cmd}
        </Text>
        {rest.length > 0 ? ` ${rest}` : ""}
      </Text>
    );
  }
  return (
    <Text style={[styles.bubbleText, { color: themeColors.foreground }]}>
      {content}
    </Text>
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

// ─── SlashCommandPicker ──────────────────────────────────────────

function SlashCommandPicker({
  input,
  onPick,
}: {
  input: string;
  onPick: (cmd: ChatCommand) => void;
}) {
  const themeColors = useThemeColors();

  // Only show the picker while the user is composing a slash command
  // and they haven't yet typed args (no space). Once they hit space
  // they're typing args and the picker would just be in the way.
  const trimmed = input.trim();
  const isPickingCommand =
    trimmed.startsWith("/") && !trimmed.includes(" ");
  if (!isPickingCommand) return null;

  const matches = filterCommands(trimmed);
  if (matches.length === 0) return null;

  return (
    <View
      style={[
        styles.pickerWrap,
        {
          backgroundColor: themeColors.card,
          borderTopColor: themeColors.border,
        },
      ]}
    >
      <FlatList
        data={matches}
        keyExtractor={(c) => c.name}
        keyboardShouldPersistTaps="handled"
        // Long lists get a scroll cap; mostly there are <10 matches.
        style={styles.pickerList}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onPick(item)}
            style={({ pressed }) => [
              styles.pickerRow,
              {
                backgroundColor: pressed
                  ? themeColors.input
                  : "transparent",
              },
            ]}
            testID={`slash-${item.name}`}
          >
            <Text
              style={[styles.pickerName, { color: themeColors.primary }]}
            >
              /{item.name}
            </Text>
            <Text
              style={[
                styles.pickerDescription,
                { color: themeColors.muted },
              ]}
              numberOfLines={1}
            >
              {item.description}
            </Text>
          </Pressable>
        )}
      />
    </View>
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
              // No bg fill on the pill itself — desktop's default
              // state has no fill, only a border that brightens on
              // hover. Mobile uses pressed-state opacity.
              borderColor: themeColors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="file-document-outline"
            size={14}
            color={themeColors.primary}
            style={styles.pillIcon}
          />
          <Text
            style={[
              styles.pillTitle,
              // muted approximates desktop's `text-foreground/70`
              // (foreground at 70% opacity).
              { color: themeColors.muted },
            ]}
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
  // Empty state matches ns-web: `flex flex-col items-center
  // justify-center py-12 gap-2` with a 32px chat icon, `text-sm`
  // muted-foreground title, and `text-xs` muted-foreground/60
  // description.
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: spacing.sm,
  },
  emptyIcon: { opacity: 0.4 },
  emptyTitle: { fontSize: 14, textAlign: "center" },
  emptyHint: { fontSize: 12, textAlign: "center", opacity: 0.6 },
  list: { padding: spacing.md, gap: spacing.sm },
  bubbleRow: { flexDirection: "row", marginBottom: spacing.sm },
  bubble: {
    // Desktop's chat bubble is `rounded-lg` (8px) + `px-2.5 py-1.5`
    // — match the geometry so the visual weight is the same.
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  userCommandChip: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 12,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
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
  pillLabel: { fontSize: 10, marginBottom: spacing.xs },
  pill: {
    // Desktop pill: `rounded-md p-2 border border-border` with a
    // file SVG icon + title text. 6px radius, 8px padding, no fill
    // — fill is only applied on hover (mobile uses pressed-state
    // opacity instead).
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  pillIcon: {},
  pillTitle: { fontSize: 12, fontWeight: "500", flex: 1 },
  pillFolder: { fontSize: 10 },
  showMore: { paddingVertical: spacing.xs, alignItems: "flex-start" },
  showMoreText: { fontSize: 12 },
  pickerWrap: {
    borderTopWidth: 1,
    maxHeight: 240,
  },
  pickerList: { maxHeight: 240 },
  pickerRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  pickerName: { fontSize: 14, fontWeight: "600", minWidth: 80 },
  pickerDescription: { fontSize: 12, flex: 1 },
  confirmationWrap: { width: "95%" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 128,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    fontSize: 14,
  },
  sendBtn: {
    // Web's `px-3 py-2 rounded-md` Ask/Stop button: 6px radius,
    // 12/8 padding. Mobile uses an explicit 48px height to align
    // with the composer input.
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 6,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  askBtnText: { fontSize: 14, fontWeight: "500" },
  stopBtnText: { fontSize: 14 },
});
