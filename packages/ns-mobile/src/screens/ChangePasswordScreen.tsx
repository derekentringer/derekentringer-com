import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SettingsStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { authApi } from "@/services/api";
import { validatePasswordStrength } from "@derekentringer/shared";
import { useAppAlert } from "@/components/AppAlertProvider";

type Props = NativeStackScreenProps<SettingsStackParamList, "ChangePassword">;

export function ChangePasswordScreen({ navigation }: Props) {
  const themeColors = useThemeColors();
  const showAlert = useAppAlert();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      setError(validation.errors[0]);
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      showAlert(
        "Password changed",
        "Your password has been updated",
        [{ text: "OK", onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change password",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    currentPassword,
    newPassword,
    confirmPassword,
    showAlert,
    navigation,
  ]);

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    !isSubmitting;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.heading, { color: themeColors.foreground }]}>
        Change Your Password
      </Text>
      <Text style={[styles.subheading, { color: themeColors.muted }]}>
        Enter your current password, then choose a new one.
      </Text>

      <Field
        label="Current password"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        autoFocus
        themeColors={themeColors}
        textContentType="password"
        autoComplete="current-password"
      />
      <Field
        label="New password"
        value={newPassword}
        onChangeText={setNewPassword}
        themeColors={themeColors}
        textContentType="newPassword"
        autoComplete="new-password"
      />
      <Field
        label="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        themeColors={themeColors}
        textContentType="newPassword"
        autoComplete="new-password"
      />

      {error ? (
        <Text style={[styles.error, { color: themeColors.error }]}>
          {error}
        </Text>
      ) : null}

      <Pressable
        style={[
          styles.submit,
          {
            backgroundColor: themeColors.primary,
            opacity: canSubmit ? 1 : 0.5,
          },
        ]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Change password"
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color={themeColors.background} />
        ) : (
          <Text style={[styles.submitText, { color: themeColors.background }]}>
            Change password
          </Text>
        )}
      </Pressable>

      <Pressable
        style={styles.cancel}
        onPress={() => navigation.goBack()}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
      >
        <Text style={[styles.cancelText, { color: themeColors.muted }]}>
          Cancel
        </Text>
      </Pressable>
    </ScrollView>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  themeColors: ReturnType<typeof useThemeColors>;
  autoFocus?: boolean;
  textContentType?: "password" | "newPassword";
  autoComplete?: "current-password" | "new-password";
}

function Field({
  label,
  value,
  onChangeText,
  themeColors,
  autoFocus,
  textContentType,
  autoComplete,
}: FieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: themeColors.muted }]}>
        {label}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            color: themeColors.foreground,
            backgroundColor: themeColors.input,
            borderColor: themeColors.border,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        textContentType={textContentType}
        autoComplete={autoComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  subheading: {
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  fieldWrap: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
  },
  error: {
    fontSize: 13,
    textAlign: "center",
    marginVertical: spacing.sm,
  },
  submit: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  submitText: {
    fontSize: 15,
    fontWeight: "700",
  },
  cancel: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 14,
  },
});
