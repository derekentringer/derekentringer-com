import React, { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";

interface MicOnlyNoticeModalProps {
  visible: boolean;
  onConfirm: (dontShowAgain: boolean) => void;
}

/** Phase H — first-time notice that mobile audio capture is mic-only.
 *  expo-audio (and the underlying iOS AVAudioRecorder / Android
 *  MediaRecorder) cannot tap system audio or active calls; the user
 *  needs to know that recording a Teams call or YouTube video on
 *  speakerphone will pick up only what the mic hears in the room. */
export function MicOnlyNoticeModal({
  visible,
  onConfirm,
}: MicOnlyNoticeModalProps) {
  const themeColors = useThemeColors();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => onConfirm(dontShowAgain)}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: themeColors.card,
              borderColor: themeColors.border,
            },
          ]}
        >
          <Text style={[styles.title, { color: themeColors.foreground }]}>
            Mobile recordings use your microphone only
          </Text>
          <Text style={[styles.body, { color: themeColors.muted }]}>
            Mobile records your microphone only. Audio from other apps on
            your device playing through your speakers{" "}
            <Text style={[styles.bodyEmphasis, { color: themeColors.foreground }]}>
              will not
            </Text>{" "}
            be captured. Use the desktop app for full system audio
            recordings.
          </Text>

          <Pressable
            onPress={() => setDontShowAgain((v) => !v)}
            style={styles.checkboxRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShowAgain }}
            accessibilityLabel="Don't show this again"
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: themeColors.border,
                  backgroundColor: dontShowAgain
                    ? themeColors.primary
                    : "transparent",
                },
              ]}
            >
              {dontShowAgain ? (
                <Text style={[styles.checkmark, { color: themeColors.background }]}>
                  ✓
                </Text>
              ) : null}
            </View>
            <Text style={[styles.checkboxLabel, { color: themeColors.muted }]}>
              Don&apos;t show this again
            </Text>
          </Pressable>

          <View style={styles.footer}>
            <Pressable
              onPress={() => onConfirm(dontShowAgain)}
              style={({ pressed }) => [
                styles.confirmButton,
                {
                  backgroundColor: pressed
                    ? `${themeColors.primary}CC`
                    : themeColors.primary,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Got it"
            >
              <Text
                style={[
                  styles.confirmText,
                  { color: themeColors.background },
                ]}
              >
                Got it
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  bodyEmphasis: {
    fontWeight: "600",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 14,
  },
  checkboxLabel: {
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: spacing.xs,
  },
  confirmButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    minWidth: 92,
    alignItems: "center",
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
