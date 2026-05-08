import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useShareIntentContext } from "expo-share-intent";
import type { Note } from "@derekentringer/ns-shared";
import { useCreateNote, useUpdateNote } from "@/hooks/useNotes";
import { useThemeColors } from "@/theme/colors";
import { borderRadius, spacing } from "@/theme";
import { appendShareContent } from "@/lib/appendShareContent";
import { AppendTargetSheet } from "./AppendTargetSheet";

/**
 * Phase E.1 — Share-sheet receiver (Android-only spike).
 *
 * When the user shares text from another app, the OS launches
 * NoteSync; expo-share-intent's ShareIntentProvider sets
 * `hasShareIntent: true` on the context. This overlay renders
 * on top of the main tab navigator and offers a single action:
 * "Save as new note." More flows (append-to-existing, folder
 * pick, image attach, URL preview) are tracked in the parent
 * Phase E plan and will follow once the spike validates the
 * intent → receive → save round trip.
 *
 * Title derivation is intentionally simple: first non-empty line
 * trimmed to 80 chars, fall back to "Shared note" when empty.
 * Users can rename in the editor afterward.
 */
export function ShareReceiverOverlay() {
  const ctx = useShareIntentContext();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const appendSheetRef = useRef<BottomSheetModal>(null);
  const [pending, setPending] = useState(false);

  // Title is derived once per intent (not per render) — useMemo
  // keyed on the text content keeps the input stable while the
  // user is looking at the preview.
  const sharedText = ctx.shareIntent?.text ?? "";
  const sharedWebUrl = ctx.shareIntent?.webUrl ?? "";
  const previewText = sharedText.length > 0 ? sharedText : sharedWebUrl;

  const derivedTitle = useMemo(() => {
    const firstLine = previewText.split("\n").find((l) => l.trim().length > 0);
    if (!firstLine) return "Shared note";
    const trimmed = firstLine.trim();
    return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  }, [previewText]);

  const dismiss = useCallback(() => {
    // `true` clears the native module's queued payload too, so a
    // subsequent share fires fresh instead of replaying the
    // previous intent.
    ctx.resetShareIntent(true);
  }, [ctx]);

  const handleSave = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      await createNote.mutateAsync({
        title: derivedTitle,
        content: previewText,
      });
      dismiss();
    } catch {
      // Surface failures via the existing alert system in a follow-
      // up; for the E.1 spike we just keep the overlay open so the
      // user can retry.
      setPending(false);
    }
  }, [pending, createNote, derivedTitle, previewText, dismiss]);

  const handleOpenAppendPicker = useCallback(() => {
    if (pending) return;
    appendSheetRef.current?.present();
  }, [pending]);

  const handleAppendToNote = useCallback(
    async (target: Note) => {
      if (pending) return;
      setPending(true);
      try {
        const newContent = appendShareContent(
          target.content ?? "",
          previewText,
          new Date(),
        );
        await updateNote.mutateAsync({
          id: target.id,
          data: { content: newContent },
        });
        dismiss();
      } catch {
        setPending(false);
      }
    },
    [pending, updateNote, previewText, dismiss],
  );

  // Hide the overlay completely when there's nothing to act on.
  // `isReady` guards against rendering during the brief boot
  // window where the native module hasn't reported yet.
  const visible =
    ctx.isReady && ctx.hasShareIntent && previewText.length > 0;

  // Mirror RN Modal's `onRequestClose` for hardware back on Android.
  // Without this the back button would walk the navigator instead of
  // dismissing the overlay. Returning `true` consumes the event.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [visible, dismiss]);

  // Reset the spinner whenever the overlay closes. The component stays
  // mounted across shares (it just renders `null`), so without this the
  // `pending=true` set during a successful save would persist into the
  // next share and leave the Save button stuck on its loading state.
  useEffect(() => {
    if (!visible) setPending(false);
  }, [visible]);

  if (!visible) {
    return null;
  }

  // Rendered as a positioned overlay (not a native Modal) so the
  // `BottomSheetModal` for the append-picker, which renders into the
  // app-level `BottomSheetModalProvider` portal, can sit above this
  // surface. RN's Modal creates a separate native window that the
  // portal can't reach into, which made the picker appear behind the
  // dialog on both Android and iOS.
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View
        style={[
          styles.backdrop,
          { backgroundColor: `${themeColors.background}E6` },
        ]}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: themeColors.card,
              borderColor: themeColors.border,
              marginTop: insets.top + spacing.lg,
              marginBottom: insets.bottom + spacing.lg,
            },
          ]}
        >
          <View style={styles.header}>
            <MaterialCommunityIcons
              name="note-plus-outline"
              size={20}
              color={themeColors.primary}
            />
            <Text style={[styles.title, { color: themeColors.foreground }]}>
              Save to NoteSync
            </Text>
            <Pressable
              onPress={dismiss}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [
                styles.closeButton,
                pressed && { opacity: 0.6 },
              ]}
            >
              <MaterialCommunityIcons
                name="close"
                size={20}
                color={themeColors.muted}
              />
            </Pressable>
          </View>

          <View
            style={[
              styles.titleRow,
              { borderBottomColor: themeColors.border },
            ]}
          >
            <Text style={[styles.titleLabel, { color: themeColors.muted }]}>
              Title
            </Text>
            <Text
              style={[styles.titleValue, { color: themeColors.foreground }]}
              numberOfLines={1}
            >
              {derivedTitle}
            </Text>
          </View>

          <ScrollView
            style={styles.previewScroll}
            contentContainerStyle={styles.previewContent}
          >
            <Text style={[styles.preview, { color: themeColors.foreground }]}>
              {previewText}
            </Text>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={dismiss}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: themeColors.border,
                  backgroundColor: themeColors.input,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: themeColors.foreground },
                ]}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleOpenAppendPicker}
              disabled={pending}
              accessibilityRole="button"
              accessibilityLabel="Append to existing note"
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: themeColors.border,
                  backgroundColor: themeColors.input,
                },
                (pressed || pending) && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: themeColors.foreground },
                ]}
                numberOfLines={1}
              >
                Append to…
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={pending}
              accessibilityRole="button"
              accessibilityLabel="Save as new note"
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: themeColors.primary },
                (pressed || pending) && { opacity: 0.7 },
              ]}
            >
              {pending ? (
                <ActivityIndicator
                  size="small"
                  color={themeColors.background}
                />
              ) : (
                <Text
                  style={[
                    styles.primaryButtonText,
                    { color: themeColors.background },
                  ]}
                  numberOfLines={1}
                >
                  Save new
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
      <AppendTargetSheet
        bottomSheetRef={appendSheetRef}
        onSelectNote={handleAppendToNote}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    flex: 1,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
    flexShrink: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  titleLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  titleValue: {
    fontSize: 14,
    flex: 1,
  },
  previewScroll: {
    maxHeight: 320,
  },
  previewContent: {
    padding: spacing.md,
  },
  preview: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  primaryButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
