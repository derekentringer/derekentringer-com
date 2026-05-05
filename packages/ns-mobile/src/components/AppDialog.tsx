import React, { useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  BackHandler,
} from "react-native";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";

export type AppDialogButtonStyle = "default" | "cancel" | "destructive";

export interface AppDialogButton {
  text: string;
  onPress?: () => void;
  style?: AppDialogButtonStyle;
}

interface AppDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AppDialogButton[];
  /** Fires when the user dismisses via backdrop tap, hardware back, or
   *  after a button's onPress handler runs. Always called. */
  onDismiss: () => void;
}

const DEFAULT_BUTTONS: AppDialogButton[] = [{ text: "OK", style: "default" }];

export function AppDialog({
  visible,
  title,
  message,
  buttons,
  onDismiss,
}: AppDialogProps) {
  const themeColors = useThemeColors();
  const resolved = buttons && buttons.length > 0 ? buttons : DEFAULT_BUTTONS;

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      const cancel = resolved.find((b) => b.style === "cancel");
      cancel?.onPress?.();
      onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [visible, resolved, onDismiss]);

  const handleBackdropPress = () => {
    const cancel = resolved.find((b) => b.style === "cancel");
    if (cancel) cancel.onPress?.();
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <Pressable
          style={[
            styles.dialog,
            { backgroundColor: themeColors.card, borderColor: themeColors.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: themeColors.foreground }]}>
            {title}
          </Text>
          {message ? (
            <Text style={[styles.message, { color: themeColors.muted }]}>
              {message}
            </Text>
          ) : null}
          <View
            style={[
              styles.buttonRow,
              resolved.length > 2 && styles.buttonColumn,
            ]}
          >
            {resolved.map((btn, i) => {
              const isDestructive = btn.style === "destructive";
              const isCancel = btn.style === "cancel";
              const bg = isDestructive
                ? themeColors.destructive
                : isCancel
                  ? "transparent"
                  : themeColors.primary;
              const fg = isDestructive
                ? "#ffffff"
                : isCancel
                  ? themeColors.foreground
                  : themeColors.background;
              const borderColor = isCancel ? themeColors.border : "transparent";
              return (
                <Pressable
                  key={`${btn.text}-${i}`}
                  style={[
                    styles.button,
                    resolved.length > 2 && styles.buttonFullWidth,
                    {
                      backgroundColor: bg,
                      borderColor,
                      borderWidth: isCancel ? 1 : 0,
                    },
                  ]}
                  onPress={() => {
                    btn.onPress?.();
                    onDismiss();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={btn.text}
                >
                  <Text style={[styles.buttonText, { color: fg }]}>
                    {btn.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  dialog: {
    width: "100%",
    maxWidth: 340,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  buttonColumn: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  button: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 80,
    alignItems: "center",
  },
  buttonFullWidth: {
    minWidth: 0,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
