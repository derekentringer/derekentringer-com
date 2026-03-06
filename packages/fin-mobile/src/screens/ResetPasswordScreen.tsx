import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { validatePasswordStrength } from "@derekentringer/shared";
import { FinLogo } from "@/components/FinLogo";
import { authApi } from "@/services/api";
import { colors, spacing, borderRadius } from "@/theme";

type ResetPasswordParams = {
  ResetPassword: { token: string };
};

export function ResetPasswordScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ResetPasswordParams, "ResetPassword">>();
  const { token } = route.params;

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const passwordValidation = newPassword
    ? validatePasswordStrength(newPassword)
    : null;

  const handleSubmit = async () => {
    if (!newPassword.trim()) {
      setError("Please enter a new password");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (passwordValidation && !passwordValidation.valid) {
      setError(passwordValidation.errors[0]);
      return;
    }

    setError("");
    setLoading(true);

    try {
      await authApi.resetPassword(token, newPassword);
      setSuccess(true);
    } catch {
      setError("Failed to reset password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <View style={styles.inner}>
          <View style={styles.logoContainer}>
            <FinLogo width={80} height={49} />
            <Text style={styles.title}>New Password</Text>
          </View>

          {success ? (
            <>
              <Text style={styles.successText}>
                Your password has been reset successfully.
              </Text>
              <TouchableOpacity
                style={styles.button}
                onPress={() => navigation.navigate("Login")}
              >
                <Text style={styles.buttonText}>Sign In</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TextInput
                style={styles.input}
                placeholder="New password"
                placeholderTextColor={colors.mutedForeground}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />

              {passwordValidation && (
                <Text
                  style={[
                    styles.passwordStrength,
                    passwordValidation.valid
                      ? styles.passwordValid
                      : styles.passwordInvalid,
                  ]}
                >
                  {passwordValidation.valid
                    ? "Password meets requirements"
                    : passwordValidation.errors[0]}
                </Text>
              )}

              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor={colors.mutedForeground}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.foreground} />
                ) : (
                  <Text style={styles.buttonText}>Reset Password</Text>
                )}
              </TouchableOpacity>

              <Pressable
                onPress={() => navigation.navigate("Login")}
                style={styles.linkButton}
              >
                <Text style={styles.linkText}>Back to Sign In</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: "300",
    marginTop: spacing.sm,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  successText: {
    color: colors.success,
    fontSize: 15,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  input: {
    backgroundColor: colors.input,
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  passwordStrength: {
    fontSize: 12,
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
  },
  passwordValid: {
    color: colors.success,
  },
  passwordInvalid: {
    color: colors.error,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  linkButton: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  linkText: {
    color: colors.primary,
    fontSize: 14,
  },
});
