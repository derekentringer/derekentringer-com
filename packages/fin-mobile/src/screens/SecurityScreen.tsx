import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { validatePasswordStrength } from "@derekentringer/shared";
import { authApi } from "@/services/api";
import useAuthStore, { useUser } from "@/store/authStore";
import { MenuSection, MenuRow, MenuSeparator } from "@/components/common/MenuRow";
import type { MoreStackParamList } from "@/navigation/types";
import { colors, spacing, borderRadius } from "@/theme";

export function SecurityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const user = useUser();
  const logout = useAuthStore((s) => s.logout);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // TOTP disable state
  const [disablingTotp, setDisablingTotp] = useState(false);

  // Revoke sessions state
  const [revokingAll, setRevokingAll] = useState(false);

  const passwordValidation = newPassword
    ? validatePasswordStrength(newPassword)
    : null;

  const handleChangePassword = async () => {
    setPasswordError("");
    setPasswordSuccess("");

    if (!currentPassword || !newPassword) {
      setPasswordError("Please fill in all fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (passwordValidation && !passwordValidation.valid) {
      setPasswordError(passwordValidation.errors[0]);
      return;
    }

    setChangingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPasswordSuccess("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      const message = err?.response?.data?.error ?? "Failed to change password";
      setPasswordError(message);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDisableTotp = () => {
    Alert.prompt(
      "Disable 2FA",
      "Enter your current TOTP code to disable two-factor authentication.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disable",
          style: "destructive",
          onPress: async (code?: string) => {
            if (!code) return;
            setDisablingTotp(true);
            try {
              await authApi.disableTotp(code);
              const updatedUser = await authApi.getMe();
              useAuthStore.getState().setUser(updatedUser);
              Alert.alert("Success", "Two-factor authentication has been disabled.");
            } catch {
              Alert.alert("Error", "Invalid code. Please try again.");
            } finally {
              setDisablingTotp(false);
            }
          },
        },
      ],
      "plain-text",
    );
  };

  const handleRevokeAll = () => {
    Alert.alert(
      "Sign Out All Devices",
      "This will sign out all sessions except the current one. You may need to sign in again on other devices.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out All",
          style: "destructive",
          onPress: async () => {
            setRevokingAll(true);
            try {
              await authApi.revokeAllSessions();
              await logout();
            } catch {
              Alert.alert("Error", "Failed to revoke sessions.");
              setRevokingAll(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Change Password */}
      <MenuSection title="Change Password">
        <View style={styles.formSection}>
          {passwordError ? (
            <Text style={styles.errorText}>{passwordError}</Text>
          ) : null}
          {passwordSuccess ? (
            <Text style={styles.successText}>{passwordSuccess}</Text>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Current password"
            placeholderTextColor={colors.mutedForeground}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
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
                styles.strengthText,
                passwordValidation.valid
                  ? styles.strengthValid
                  : styles.strengthInvalid,
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
            style={[styles.submitButton, changingPassword && styles.buttonDisabled]}
            onPress={handleChangePassword}
            disabled={changingPassword}
          >
            {changingPassword ? (
              <ActivityIndicator color={colors.foreground} size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Change Password</Text>
            )}
          </TouchableOpacity>
        </View>
      </MenuSection>

      {/* Two-Factor Authentication */}
      <MenuSection title="Two-Factor Authentication">
        {user?.totpEnabled ? (
          <MenuRow
            icon="shield-check-outline"
            label="2FA Enabled"
            subtitle="Your account is protected with TOTP"
            trailing={
              <TouchableOpacity
                onPress={handleDisableTotp}
                disabled={disablingTotp}
              >
                <Text style={styles.disableText}>
                  {disablingTotp ? "..." : "Disable"}
                </Text>
              </TouchableOpacity>
            }
          />
        ) : (
          <MenuRow
            icon="shield-lock-outline"
            label="Set Up 2FA"
            subtitle="Add an extra layer of security"
            onPress={() => navigation.navigate("TotpSetup")}
          />
        )}
      </MenuSection>

      {/* Sessions */}
      <MenuSection title="Sessions">
        <MenuRow
          icon="logout"
          label="Sign Out All Devices"
          subtitle="End all active sessions"
          destructive
          onPress={handleRevokeAll}
          trailing={
            revokingAll ? (
              <ActivityIndicator size="small" color={colors.destructive} />
            ) : undefined
          }
        />
      </MenuSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  formSection: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.input,
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
  },
  strengthText: {
    fontSize: 11,
    marginTop: -spacing.xs,
  },
  strengthValid: {
    color: colors.success,
  },
  strengthInvalid: {
    color: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    textAlign: "center",
  },
  successText: {
    color: colors.success,
    fontSize: 13,
    textAlign: "center",
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  disableText: {
    color: colors.destructive,
    fontSize: 13,
    fontWeight: "600",
  },
});
