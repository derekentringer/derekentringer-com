import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { colors, spacing, borderRadius } from "@/theme";

interface CurrencyInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
}

export function CurrencyInput({
  label,
  value,
  onChangeText,
  placeholder,
  error,
}: CurrencyInputProps) {
  function handleChange(text: string) {
    // Allow digits and one decimal point
    const cleaned = text.replace(/[^0-9.]/g, "");
    // Prevent multiple decimal points
    const parts = cleaned.split(".");
    const sanitized = parts.length > 2
      ? parts[0] + "." + parts.slice(1).join("")
      : cleaned;
    onChangeText(sanitized);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, error ? styles.inputError : undefined]}>
        <Text style={styles.prefix}>$</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder ?? "0.00"}
          placeholderTextColor={colors.mutedForeground}
          keyboardType="decimal-pad"
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  inputError: {
    borderColor: colors.error,
  },
  prefix: {
    color: colors.muted,
    fontSize: 15,
    marginRight: 4,
  },
  input: {
    flex: 1,
    color: colors.foreground,
    fontSize: 15,
    padding: spacing.sm,
    paddingHorizontal: 0,
  },
  error: {
    color: colors.error,
    fontSize: 12,
    marginTop: 2,
  },
});
