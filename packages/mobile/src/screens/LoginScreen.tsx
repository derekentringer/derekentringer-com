import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { FinLogo } from "@/components/FinLogo";
import useAuthStore from "@/store/authStore";
import { colors, spacing, borderRadius } from "@/theme";

export function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((state) => state.login);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Please enter username and password");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await login(username.trim(), password);
    } catch {
      setError("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <View style={styles.logoContainer}>
          <FinLogo width={80} height={49} />
          <Text style={styles.title}>fin</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor={colors.mutedForeground}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
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

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.foreground} />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
});
