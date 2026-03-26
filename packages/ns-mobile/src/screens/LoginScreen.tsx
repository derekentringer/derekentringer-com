import React, { useState, useRef, useCallback } from "react";
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
import * as Haptics from "expo-haptics";
import { NsLogo } from "@/components/common/NsLogo";
import useAuthStore from "@/store/authStore";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";

const TOTP_LENGTH = 6;

export function LoginScreen() {
  const themeColors = useThemeColors();
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

  const styles = makeStyles(themeColors);

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
              <NsLogo width={60} height={60} />
              <Text style={styles.title}>Two-Factor Authentication</Text>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {useBackupCode ? (
              <>
                <Text style={styles.subtitle}>Enter a backup code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Backup code"
                  placeholderTextColor={themeColors.mutedForeground}
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
                    <ActivityIndicator color={themeColors.foreground} />
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
        <NsLogo width={60} height={60} />
        <Text style={styles.title}>NoteSync</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={themeColors.mutedForeground}
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
        placeholderTextColor={themeColors.mutedForeground}
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
          <ActivityIndicator color="#0f1117" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>
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

function makeStyles(themeColors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
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
      color: themeColors.foreground,
      fontSize: 28,
      fontWeight: "300",
      marginTop: spacing.sm,
    },
    subtitle: {
      color: themeColors.muted,
      fontSize: 14,
      textAlign: "center",
      marginBottom: spacing.lg,
    },
    error: {
      color: themeColors.error,
      fontSize: 14,
      textAlign: "center",
      marginBottom: spacing.md,
    },
    input: {
      backgroundColor: themeColors.input,
      color: themeColors.foreground,
      borderWidth: 1,
      borderColor: themeColors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
      fontSize: 16,
      marginBottom: spacing.md,
    },
    button: {
      backgroundColor: themeColors.primary,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.sm + 4,
      alignItems: "center",
      marginTop: spacing.sm,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    buttonText: {
      color: "#0f1117",
      fontSize: 16,
      fontWeight: "600",
    },
    linkButton: {
      paddingVertical: spacing.sm,
    },
    linkText: {
      color: themeColors.primary,
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
      backgroundColor: themeColors.input,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: themeColors.border,
      color: themeColors.foreground,
      fontSize: 22,
      fontWeight: "700",
      textAlign: "center",
    },
    totpInputError: {
      borderColor: themeColors.error,
    },
  });
}
