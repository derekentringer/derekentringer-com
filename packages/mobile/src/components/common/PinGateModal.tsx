import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, TextInput, Modal, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import useAuthStore from "@/store/authStore";
import { colors, spacing, borderRadius } from "@/theme";

interface PinGateModalProps {
  visible: boolean;
  onClose: () => void;
  onVerified: (pinToken: string) => void;
  title?: string;
  description?: string;
}

const PIN_LENGTH = 4;

export function PinGateModal({
  visible,
  onClose,
  onVerified,
  title = "Enter PIN",
  description = "Enter your 4-digit PIN to continue",
}: PinGateModalProps) {
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Check if PIN is already valid when modal becomes visible
  useEffect(() => {
    if (visible) {
      const { isPinValid, pinToken } = useAuthStore.getState();
      if (isPinValid() && pinToken) {
        onVerified(pinToken);
        return;
      }
      // Reset state
      setDigits(["", "", "", ""]);
      setError("");
      setSubmitting(false);
      // Focus first input
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [visible, onVerified]);

  const handleDigitChange = useCallback(
    async (text: string, index: number) => {
      if (submitting) return;

      const digit = text.replace(/[^0-9]/g, "").slice(-1);
      const newDigits = [...digits];
      newDigits[index] = digit;
      setDigits(newDigits);
      setError("");

      if (digit && index < PIN_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }

      // Auto-submit on last digit
      if (digit && index === PIN_LENGTH - 1) {
        const pin = newDigits.join("");
        if (pin.length === PIN_LENGTH) {
          setSubmitting(true);
          try {
            await useAuthStore.getState().verifyPin(pin);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const { pinToken } = useAuthStore.getState();
            if (pinToken) {
              onVerified(pinToken);
            }
          } catch {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setError("Invalid PIN");
            setDigits(["", "", "", ""]);
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
          } finally {
            setSubmitting(false);
          }
        }
      }
    },
    [digits, submitting, onVerified],
  );

  const handleKeyPress = useCallback(
    (e: { nativeEvent: { key: string } }, index: number) => {
      if (e.nativeEvent.key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          <View style={styles.pinRow}>
            {digits.map((digit, i) => (
              <TextInput
                key={i}
                ref={(ref) => { inputRefs.current[i] = ref; }}
                style={[styles.pinInput, error ? styles.pinInputError : undefined]}
                value={digit}
                onChangeText={(text) => handleDigitChange(text, i)}
                onKeyPress={(e) => handleKeyPress(e, i)}
                keyboardType="number-pad"
                maxLength={1}
                secureTextEntry
                selectTextOnFocus
              />
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={styles.cancelButton}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
  },
  title: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  description: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  pinRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pinInput: {
    width: 48,
    height: 56,
    backgroundColor: colors.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.foreground,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  pinInputError: {
    borderColor: colors.error,
  },
  error: {
    color: colors.error,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cancelText: {
    color: colors.muted,
    fontSize: 14,
  },
});
