import React from "react";
import { View, Text, TextInput, StyleSheet, type KeyboardTypeOptions } from "react-native";
import { colors, spacing, borderRadius } from "@/theme";

interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
}

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType,
  autoFocus,
  multiline,
  numberOfLines,
}: FormFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          error ? styles.inputError : undefined,
          multiline ? styles.multiline : undefined,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        multiline={multiline}
        numberOfLines={numberOfLines}
      />
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
  input: {
    backgroundColor: colors.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.foreground,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    minHeight: 44,
  },
  inputError: {
    borderColor: colors.error,
  },
  multiline: {
    textAlignVertical: "top",
  },
  error: {
    color: colors.error,
    fontSize: 12,
    marginTop: 2,
  },
});
