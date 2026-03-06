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
import { useNavigation } from "@react-navigation/native";
import { FinLogo } from "@/components/FinLogo";
import { authApi } from "@/services/api";
import { colors, spacing, borderRadius } from "@/theme";

export function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch {
      setError("Failed to send reset email");
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
            <Text style={styles.title}>Reset Password</Text>
          </View>

          {sent ? (
            <>
              <Text style={styles.successText}>
                Check your email for reset instructions.
              </Text>
              <Pressable
                onPress={() => navigation.goBack()}
                style={styles.linkButton}
              >
                <Text style={styles.linkText}>Back to Sign In</Text>
              </Pressable>
            </>
          ) : (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Text style={styles.subtitle}>
                Enter your email address and we'll send you a link to reset your
                password.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                autoFocus
              />

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.foreground} />
                ) : (
                  <Text style={styles.buttonText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>

              <Pressable
                onPress={() => navigation.goBack()}
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
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    marginBottom: spacing.lg,
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
