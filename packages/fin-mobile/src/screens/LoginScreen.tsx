import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { FinLogo } from "@/components/FinLogo";
import useAuthStore from "@/store/authStore";
import { colors, spacing, borderRadius } from "@/theme";

const TOTP_LENGTH = 6;

export function LoginScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // TOTP state
  const [totpMode, setTotpMode] = useState(false);
  const [totpToken, setTotpToken] = useState("");
  const [totpDigits, setTotpDigits] = useState<string[]>(Array(TOTP_LENGTH).fill(""));
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const totpInputRefs = useRef<(TextInput | null)[]>([]);

  const login = useAuthStore((state) => state.login);
  const verifyTotp = useAuthStore((state) => state.verifyTotp);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter email and password");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const result = await login(email.trim(), password);
      if (result.requiresTotp && result.totpToken) {
        setTotpToken(result.totpToken);
        setTotpMode(true);
        setTotpDigits(Array(TOTP_LENGTH).fill(""));
        setBackupCode("");
        setUseBackupCode(false);
        setTimeout(() => totpInputRefs.current[0]?.focus(), 100);
      }
    } catch {
      setError("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = useCallback(async (code: string) => {
    setError("");
    setLoading(true);
    try {
      await verifyTotp(totpToken, code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Invalid verification code");
      setTotpDigits(Array(TOTP_LENGTH).fill(""));
      setBackupCode("");
      setTimeout(() => totpInputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  }, [verifyTotp, totpToken]);

  const handleDigitChange = useCallback(
    (text: string, index: number) => {
      if (loading) return;
      const digit = text.replace(/[^0-9]/g, "").slice(-1);
      const newDigits = [...totpDigits];
      newDigits[index] = digit;
      setTotpDigits(newDigits);
      setError("");

      if (digit && index < TOTP_LENGTH - 1) {
        totpInputRefs.current[index + 1]?.focus();
      }

      // Auto-submit on last digit
      if (digit && index === TOTP_LENGTH - 1) {
        const code = newDigits.join("");
        if (code.length === TOTP_LENGTH) {
          handleTotpSubmit(code);
        }
      }
    },
    [totpDigits, loading, handleTotpSubmit],
  );

  const handleKeyPress = useCallback(
    (e: { nativeEvent: { key: string } }, index: number) => {
      if (e.nativeEvent.key === "Backspace" && !totpDigits[index] && index > 0) {
        totpInputRefs.current[index - 1]?.focus();
      }
    },
    [totpDigits],
  );

  const handleBackupSubmit = () => {
    if (!backupCode.trim()) return;
    handleTotpSubmit(backupCode.trim());
  };

  const handleBackToLogin = () => {
    setTotpMode(false);
    setTotpToken("");
    setTotpDigits(Array(TOTP_LENGTH).fill(""));
    setBackupCode("");
    setUseBackupCode(false);
    setError("");
  };

  if (totpMode) {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView style={styles.container} behavior="padding">
          <View style={styles.inner}>
            <View style={styles.logoContainer}>
              <FinLogo width={80} height={49} />
              <Text style={styles.title}>Two-Factor Authentication</Text>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {useBackupCode ? (
              <>
                <Text style={styles.subtitle}>Enter a backup code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Backup code"
                  placeholderTextColor={colors.mutedForeground}
                  value={backupCode}
                  onChangeText={setBackupCode}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleBackupSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.foreground} />
                  ) : (
                    <Text style={styles.buttonText}>Verify</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.subtitle}>
                  Enter the 6-digit code from your authenticator app
                </Text>
                <View style={styles.totpRow}>
                  {totpDigits.map((digit, i) => (
                    <TextInput
                      key={i}
                      ref={(ref) => { totpInputRefs.current[i] = ref; }}
                      style={[styles.totpInput, error ? styles.totpInputError : undefined]}
                      value={digit}
                      onChangeText={(text) => handleDigitChange(text, i)}
                      onKeyPress={(e) => handleKeyPress(e, i)}
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                    />
                  ))}
                </View>
              </>
            )}

            <Pressable
              onPress={() => setUseBackupCode(!useBackupCode)}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>
                {useBackupCode ? "Use authenticator code" : "Use backup code"}
              </Text>
            </Pressable>

            <Pressable onPress={handleBackToLogin} style={styles.linkButton}>
              <Text style={styles.linkText}>Back to Sign In</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    );
  }

  const content = (
    <View style={styles.inner}>
      <View style={styles.logoContainer}>
        <FinLogo width={80} height={49} />
        <Text style={styles.title}>fin</Text>
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

      <View style={styles.linksRow}>
        <Pressable
          onPress={() => navigation.navigate("ForgotPassword")}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>Forgot password?</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("Register")}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>Create account</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        {content}
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
  linksRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
  },
  linkButton: {
    paddingVertical: spacing.sm,
  },
  linkText: {
    color: colors.primary,
    fontSize: 14,
    textAlign: "center",
  },
  totpRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  totpInput: {
    width: 44,
    height: 52,
    backgroundColor: colors.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  totpInputError: {
    borderColor: colors.error,
  },
});
