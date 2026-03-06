import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import type { TotpSetupResponse } from "@derekentringer/shared";
import { authApi } from "@/services/api";
import useAuthStore from "@/store/authStore";
import { colors, spacing, borderRadius } from "@/theme";

const CODE_LENGTH = 6;

type Step = "loading" | "scan" | "verify" | "backup";

export function TotpSetupScreen() {
  const navigation = useNavigation();
  const [step, setStep] = useState<Step>("loading");
  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null);
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await authApi.setupTotp();
        setSetupData(data);
        setStep("scan");
      } catch {
        setError("Failed to start 2FA setup");
      }
    })();
  }, []);

  const handleDigitChange = useCallback(
    (text: string, index: number) => {
      if (verifying) return;
      const digit = text.replace(/[^0-9]/g, "").slice(-1);
      const newDigits = [...digits];
      newDigits[index] = digit;
      setDigits(newDigits);
      setError("");

      if (digit && index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }

      if (digit && index === CODE_LENGTH - 1) {
        const code = newDigits.join("");
        if (code.length === CODE_LENGTH) {
          handleVerify(code);
        }
      }
    },
    [digits, verifying],
  );

  const handleKeyPress = useCallback(
    (e: { nativeEvent: { key: string } }, index: number) => {
      if (e.nativeEvent.key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

  const handleVerify = async (code: string) => {
    setVerifying(true);
    setError("");
    try {
      const result = await authApi.verifyTotpSetup(code);
      setBackupCodes(result.backupCodes);
      setStep("backup");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Invalid code. Please try again.");
      setDigits(Array(CODE_LENGTH).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setVerifying(false);
    }
  };

  const handleDone = async () => {
    try {
      const updatedUser = await authApi.getMe();
      useAuthStore.getState().setUser(updatedUser);
    } catch {
      // User data will be refreshed on next app load
    }
    navigation.goBack();
  };

  if (step === "loading") {
    return (
      <View style={styles.centered}>
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <ActivityIndicator size="large" color={colors.primary} />
        )}
      </View>
    );
  }

  if (step === "backup") {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.heading}>Save Your Backup Codes</Text>
        <Text style={styles.description}>
          Store these codes in a safe place. Each code can only be used once to
          sign in if you lose access to your authenticator app.
        </Text>

        <View style={styles.codesContainer}>
          {backupCodes.map((code, i) => (
            <Text key={i} style={styles.codeText}>
              {code}
            </Text>
          ))}
        </View>

        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      {step === "scan" && setupData && (
        <>
          <Text style={styles.heading}>Set Up Two-Factor Authentication</Text>
          <Text style={styles.description}>
            Scan this QR code with your authenticator app (Google Authenticator,
            Authy, etc.)
          </Text>

          <View style={styles.qrContainer}>
            <Image
              source={{ uri: setupData.qrCodeDataUrl }}
              style={styles.qrImage}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.manualLabel}>
            Or enter this code manually:
          </Text>
          <View style={styles.secretContainer}>
            <Text style={styles.secretText} selectable>
              {setupData.secret}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.nextButton}
            onPress={() => {
              setStep("verify");
              setTimeout(() => inputRefs.current[0]?.focus(), 100);
            }}
          >
            <Text style={styles.nextButtonText}>Next</Text>
          </TouchableOpacity>
        </>
      )}

      {step === "verify" && (
        <>
          <Text style={styles.heading}>Verify Setup</Text>
          <Text style={styles.description}>
            Enter the 6-digit code from your authenticator app to complete
            setup.
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.codeRow}>
            {digits.map((digit, i) => (
              <TextInput
                key={i}
                ref={(ref) => { inputRefs.current[i] = ref; }}
                style={[
                  styles.codeInput,
                  error ? styles.codeInputError : undefined,
                ]}
                value={digit}
                onChangeText={(text) => handleDigitChange(text, i)}
                onKeyPress={(e) => handleKeyPress(e, i)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
              />
            ))}
          </View>

          {verifying && (
            <ActivityIndicator
              color={colors.primary}
              style={styles.verifyingIndicator}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  heading: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    textAlign: "center",
  },
  qrContainer: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignSelf: "center",
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  manualLabel: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
  },
  secretContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: "center",
  },
  secretText: {
    color: colors.foreground,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 1,
  },
  nextButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  nextButtonText: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  codeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
  },
  codeInput: {
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
  codeInputError: {
    borderColor: colors.error,
  },
  verifyingIndicator: {
    marginTop: spacing.md,
  },
  codesContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  codeText: {
    color: colors.foreground,
    fontSize: 16,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    textAlign: "center",
    letterSpacing: 2,
  },
  doneButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  doneButtonText: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
});
