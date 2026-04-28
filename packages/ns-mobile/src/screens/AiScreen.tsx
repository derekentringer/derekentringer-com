// Phase A.1 (mobile parity): basic AI chat foundation.
//
// Replaces the "Coming soon" placeholder with a working chat:
// streaming text from /ai/ask, user + assistant turns, send /
// stop / clear. Tools, citations, source pills, slash commands,
// confirmation cards, and chat persistence land in subsequent
// sub-phases (A.2 → A.5).

import React, { useCallback, useRef, useState } from "react";
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
import { useThemeColors } from "@/theme/colors";
import { spacing } from "@/theme";
import { askQuestion } from "@/api/ai";

interface Message {
  role: "user" | "assistant";
  content: string;
  failed?: boolean;
}

export function AiScreen() {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

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

        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (!last || last.role !== "assistant") return prev;

          if (event.text) {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + event.text,
            };
          }
          if (event.error) {
            updated[updated.length - 1] = {
              ...last,
              content: event.error,
              failed: true,
            };
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
  }, [input, isStreaming, scrollToBottom]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleClear = useCallback(() => {
    if (isStreaming) abortRef.current?.abort();
    setMessages([]);
  }, [isStreaming]);

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isUser = item.role === "user";
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
                backgroundColor: isUser
                  ? themeColors.input
                  : themeColors.card,
                borderColor: item.failed
                  ? themeColors.destructive
                  : themeColors.border,
              },
            ]}
          >
            {item.content.length === 0 && !isUser ? (
              <ActivityIndicator size="small" color={themeColors.muted} />
            ) : (
              <Text
                style={[
                  styles.bubbleText,
                  {
                    color: item.failed
                      ? themeColors.destructive
                      : themeColors.foreground,
                  },
                ]}
              >
                {item.content}
              </Text>
            )}
          </View>
        </View>
      );
    },
    [themeColors],
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View
        style={[
          styles.header,
          { borderBottomColor: themeColors.border },
        ]}
      >
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
          renderItem={renderMessage}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  headerAction: {
    fontSize: 13,
  },
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
  emptyHint: {
    fontSize: 13,
    textAlign: "center",
  },
  list: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  bubbleRow: {
    flexDirection: "row",
    marginBottom: spacing.sm,
  },
  bubble: {
    maxWidth: "85%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
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
  sendBtnText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
