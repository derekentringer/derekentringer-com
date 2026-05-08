import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type {
  TotpSetupResponse,
  TotpVerifySetupResponse,
} from "@derekentringer/shared";
import type { SettingsStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { authApi } from "@/services/api";
import useAuthStore from "@/store/authStore";
import { useAppAlert } from "@/components/AppAlertProvider";

type Props = NativeStackScreenProps<SettingsStackParamList, "TwoFactorAuth">;

// Internal state machine. Mirrors the inline state desktop/web's
// SettingsPage uses, but as a fullscreen flow on mobile.
type Mode =
  | "idle"
  | "settingUp"
  | "showingBackupCodes"
  | "disabling";

export function TwoFactorAuthScreen({ navigation }: Props) {
  const themeColors = useThemeColors();
  const showAlert = useAppAlert();

  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const totpEnabled = user?.totpEnabled === true;

  const [mode, setMode] = useState<Mode>("idle");
  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = useCallback(() => {
    setMode("idle");
    setSetupData(null);
    setCode("");
    setBackupCodes(null);
    setError("");
    setIsSubmitting(false);
  }, []);

  const handleStartSetup = useCallback(async () => {
    setError("");
    setIsSubmitting(true);
    try {
      const data = await authApi.setupTotp();
      setSetupData(data);
      setMode("settingUp");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start 2FA setup",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const handleVerifySetup = useCallback(async () => {
    setError("");
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result: TotpVerifySetupResponse = await authApi.verifyTotpSetup(code);
      setBackupCodes(result.backupCodes);
      setMode("showingBackupCodes");
      setCode("");
      // Refresh the user object so totpEnabled flips to true.
      try {
        const fresh = await authApi.getMe();
        setUser(fresh);
      } catch {
        // Non-fatal — login state stays valid; flag will catch up
        // on the next app launch.
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setIsSubmitting(false);
    }
  }, [code, setUser]);

  const handleStartDisable = useCallback(() => {
    setError("");
    setCode("");
    setMode("disabling");
  }, []);

  const handleConfirmDisable = useCallback(async () => {
    setError("");
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setIsSubmitting(true);
    try {
      await authApi.disableTotp(code);
      try {
        const fresh = await authApi.getMe();
        setUser(fresh);
      } catch {
        // Non-fatal.
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(
        "Two-Factor Authentication Disabled",
        "You'll only need your password to sign in.",
        [{ text: "OK", onPress: reset }],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setIsSubmitting(false);
    }
  }, [code, setUser, showAlert, reset]);

  const handleCopyBackupCodes = useCallback(async () => {
    if (!backupCodes) return;
    await Clipboard.setStringAsync(backupCodes.join("\n"));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Copied", "Backup codes copied to clipboard.");
  }, [backupCodes, showAlert]);

  const handleOpenInAuthenticator = useCallback(async () => {
    if (!setupData) return;
    // `otpauth://` is the standard scheme registered by every major
    // authenticator (Google Authenticator, 1Password, Authy,
    // Microsoft Authenticator, Bitwarden). On iOS the OS routes to
    // the default handler; on Android it shows a chooser.
    //
    // We deliberately do NOT call `Linking.canOpenURL` first.
    // Starting on Android API 30 (Android 11), package-visibility
    // restrictions make `canOpenURL` return `false` for any URL
    // scheme the app hasn't declared in a `<queries>` block in
    // AndroidManifest.xml — even when a handler IS installed. So
    // a Google Authenticator user would see "No authenticator app
    // found" despite having the app on their phone. We rely on
    // `openURL` instead, which still routes the intent correctly,
    // and only show the install-an-app dialog if `openURL` itself
    // throws (which is what happens when no handler exists).
    try {
      await Linking.openURL(setupData.otpauthUrl);
    } catch {
      showAlert(
        "No authenticator app found",
        "Install Google Authenticator, 1Password, Authy, or any TOTP app, then come back and tap “Open in authenticator app” again. You can also copy the setup key and paste it manually.",
      );
    }
  }, [setupData, showAlert]);

  const handleCopySecret = useCallback(async () => {
    if (!setupData) return;
    await Clipboard.setStringAsync(setupData.secret);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Copied", "Setup key copied to clipboard.");
  }, [setupData, showAlert]);

  const handleFinishBackupCodes = useCallback(() => {
    reset();
    navigation.goBack();
  }, [reset, navigation]);

  // ─── Renders ───────────────────────────────────────────────────

  if (mode === "showingBackupCodes" && backupCodes) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: themeColors.background }]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.iconBadge}>
          <MaterialCommunityIcons
            name="check-circle"
            size={48}
            color={themeColors.success}
          />
        </View>
        <Text style={[styles.heading, { color: themeColors.foreground }]}>
          Save your backup codes
        </Text>
        <Text style={[styles.subheading, { color: themeColors.muted }]}>
          Each code can be used once if you lose access to your authenticator
          app. Store them somewhere safe — they will not be shown again
        </Text>

        <View
          style={[
            styles.backupCodesBox,
            {
              backgroundColor: themeColors.card,
              borderColor: themeColors.border,
            },
          ]}
        >
          {backupCodes.map((c) => (
            <Text
              key={c}
              style={[styles.backupCode, { color: themeColors.foreground }]}
              selectable
            >
              {c}
            </Text>
          ))}
        </View>

        <Pressable
          style={[styles.secondaryButton, { borderColor: themeColors.border }]}
          onPress={handleCopyBackupCodes}
          accessibilityRole="button"
          accessibilityLabel="Copy backup codes"
        >
          <MaterialCommunityIcons
            name="content-copy"
            size={18}
            color={themeColors.foreground}
          />
          <Text
            style={[styles.secondaryButtonText, { color: themeColors.foreground }]}
          >
            Copy
          </Text>
        </Pressable>

        <Pressable
          style={[styles.primaryButton, { backgroundColor: themeColors.primary }]}
          onPress={handleFinishBackupCodes}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text
            style={[styles.primaryButtonText, { color: themeColors.background }]}
          >
            Done
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (mode === "settingUp" && setupData) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: themeColors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.heading, { color: themeColors.foreground }]}>
          Add to Authenticator App
        </Text>
        <Text style={[styles.subheading, { color: themeColors.muted }]}>
          Open your authenticator app (Google Authenticator, 1Password, Authy,
          etc.) and add NoteSync, then enter the 6-digit code it gives you
        </Text>

        {/* Primary path on mobile: a deep link via the otpauth:// scheme.
            Every major TOTP authenticator registers a handler for this
            scheme, so the OS opens (or prompts to choose) the user's
            authenticator with the issuer + account + secret pre-filled.
            We deliberately don't render the QR code on mobile — the
            user can't scan their own screen, and cross-device enrollment
            (tablet / separate phone / desktop) is better handled from
            ns-web or ns-desktop where the QR makes sense. */}
        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: themeColors.primary },
          ]}
          onPress={handleOpenInAuthenticator}
          accessibilityRole="button"
          accessibilityLabel="Open in authenticator app"
        >
          <MaterialCommunityIcons
            name="shield-key"
            size={18}
            color={themeColors.background}
            style={{ marginRight: spacing.xs }}
          />
          <Text
            style={[
              styles.primaryButtonText,
              { color: themeColors.background },
            ]}
          >
            Open in authenticator app
          </Text>
        </Pressable>

        {/* Fallback path: copy the raw secret. Some authenticator apps
            don't intercept otpauth:// links and instead expect the user
            to paste the setup key into a manual-entry form. */}
        <Pressable
          style={[
            styles.secondaryButton,
            { borderColor: themeColors.border, marginTop: spacing.sm },
          ]}
          onPress={handleCopySecret}
          accessibilityRole="button"
          accessibilityLabel="Copy setup key"
        >
          <MaterialCommunityIcons
            name="content-copy"
            size={18}
            color={themeColors.foreground}
          />
          <Text
            style={[
              styles.secondaryButtonText,
              { color: themeColors.foreground },
            ]}
          >
            Copy setup key
          </Text>
        </Pressable>

        <Text
          style={[
            styles.fieldLabel,
            { color: themeColors.muted, marginTop: spacing.lg },
          ]}
        >
          Verification code
        </Text>
        <TextInput
          style={[
            styles.codeInput,
            {
              color: themeColors.foreground,
              backgroundColor: themeColors.input,
              borderColor: themeColors.border,
            },
          ]}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
          placeholder="Enter 6-digit code"
          placeholderTextColor={themeColors.muted}
          keyboardType="number-pad"
          maxLength={6}
        />

        {error ? (
          <Text style={[styles.error, { color: themeColors.error }]}>
            {error}
          </Text>
        ) : null}

        <Pressable
          style={[
            styles.primaryButton,
            {
              backgroundColor: themeColors.primary,
              opacity: code.length === 6 && !isSubmitting ? 1 : 0.5,
            },
          ]}
          onPress={handleVerifySetup}
          disabled={code.length !== 6 || isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Verify and enable 2FA"
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={themeColors.background} />
          ) : (
            <Text
              style={[
                styles.primaryButtonText,
                { color: themeColors.background },
              ]}
            >
              Verify & enable
            </Text>
          )}
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (mode === "disabling") {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: themeColors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.heading, { color: themeColors.foreground }]}>
          Disable Two-Factor Authentication
        </Text>
        <Text style={[styles.subheading, { color: themeColors.muted }]}>
          Enter the 6-digit code from your authenticator app to confirm
        </Text>

        <Text style={[styles.fieldLabel, { color: themeColors.muted }]}>
          Verification code
        </Text>
        <TextInput
          style={[
            styles.codeInput,
            {
              color: themeColors.foreground,
              backgroundColor: themeColors.input,
              borderColor: themeColors.border,
            },
          ]}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
          placeholder="Enter code"
          placeholderTextColor={themeColors.muted}
          keyboardType="number-pad"
          maxLength={6}
        />

        {error ? (
          <Text style={[styles.error, { color: themeColors.error }]}>
            {error}
          </Text>
        ) : null}

        <Pressable
          style={[
            styles.destructiveButton,
            {
              backgroundColor: themeColors.destructive,
              opacity: code.length === 6 && !isSubmitting ? 1 : 0.5,
            },
          ]}
          onPress={handleConfirmDisable}
          disabled={code.length !== 6 || isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Confirm disable 2FA"
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.destructiveButtonText}>Confirm Disable</Text>
          )}
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Idle state — landing screen for the route.
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.statusRow}>
        <Text style={[styles.heading, { color: themeColors.foreground }]}>
          Two-Factor Authentication
        </Text>
        {totpEnabled ? (
          <View
            style={[
              styles.enabledBadge,
              { backgroundColor: `${themeColors.success}33` },
            ]}
          >
            <Text style={[styles.enabledBadgeText, { color: themeColors.success }]}>
              Enabled
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.subheading, { color: themeColors.muted }]}>
        {totpEnabled
          ? "Two-factor authentication is currently active. You'll need a 6-digit code from your authenticator app each time you sign in."
          : "Adds a 6-digit code from an authenticator app to your sign-in. We recommend Google Authenticator, 1Password, or Authy."}
      </Text>

      {error ? (
        <Text style={[styles.error, { color: themeColors.error }]}>
          {error}
        </Text>
      ) : null}

      {totpEnabled ? (
        <Pressable
          style={[
            styles.destructiveButton,
            { backgroundColor: themeColors.destructive },
          ]}
          onPress={handleStartDisable}
          accessibilityRole="button"
          accessibilityLabel="Disable 2FA"
        >
          <Text style={styles.destructiveButtonText}>Disable 2FA</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[
            styles.primaryButton,
            {
              backgroundColor: themeColors.primary,
              opacity: isSubmitting ? 0.5 : 1,
            },
          ]}
          onPress={handleStartSetup}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Enable 2FA"
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={themeColors.background} />
          ) : (
            <Text
              style={[
                styles.primaryButtonText,
                { color: themeColors.background },
              ]}
            >
              Enable 2FA
            </Text>
          )}
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
  },
  subheading: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  enabledBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  enabledBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  iconBadge: {
    alignItems: "center",
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  codeInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
    fontSize: 22,
    fontFamily: "monospace",
    letterSpacing: 6,
    textAlign: "center",
  },
  primaryButton: {
    flexDirection: "row",
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  destructiveButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  destructiveButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  error: {
    fontSize: 13,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  backupCodesBox: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 4,
  },
  backupCode: {
    fontFamily: "monospace",
    fontSize: 14,
    letterSpacing: 1,
    textAlign: "center",
  },
});
