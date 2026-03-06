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
  ScrollView,
  Pressable,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { validatePasswordStrength } from "@derekentringer/shared";
import { FinLogo } from "@/components/FinLogo";
import { authApi } from "@/services/api";
import useAuthStore from "@/store/authStore";
import { colors, spacing, borderRadius } from "@/theme";

export function RegisterScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordValidation = password ? validatePasswordStrength(password) : null;

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter email and password");
      return;
    }

    if (password !== confirmPassword) {
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
      const data = await authApi.register(
        email.trim(),
        password,
        displayName.trim() || undefined,
      );
      useAuthStore.getState().setUser(data.user);
      useAuthStore.setState({ isAuthenticated: true });
    } catch (err: any) {
      const message = err?.response?.data?.error ?? "Registration failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.inner}>
            <View style={styles.logoContainer}>
              <FinLogo width={80} height={49} />
              <Text style={styles.title}>Create Account</Text>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

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
            />

            <TextInput
              style={styles.input}
              placeholder="Display name (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={displayName}
              onChangeText={setDisplayName}
              autoCorrect={false}
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
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
              placeholder="Confirm password"
              placeholderTextColor={colors.mutedForeground}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.foreground} />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>
                Already have an account? Sign in
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
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
