import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, Switch, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  AccountType,
  type Account,
  type CreateAccountRequest,
  type UpdateAccountRequest,
} from "@derekentringer/shared/finance";
import { FormField } from "@/components/common/FormField";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { PickerField } from "@/components/common/PickerField";
import { colors, spacing, borderRadius } from "@/theme";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.Checking]: "Checking",
  [AccountType.Savings]: "Savings",
  [AccountType.HighYieldSavings]: "High Yield Savings",
  [AccountType.Credit]: "Credit",
  [AccountType.Investment]: "Investment",
  [AccountType.Loan]: "Loan",
  [AccountType.RealEstate]: "Real Estate",
  [AccountType.Other]: "Other",
};

const ACCOUNT_TYPE_OPTIONS = Object.entries(ACCOUNT_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const INTEREST_RATE_TYPES = new Set([
  AccountType.HighYieldSavings,
  AccountType.Savings,
  AccountType.Loan,
]);

const DTI_TYPES = new Set([
  AccountType.Loan,
  AccountType.Credit,
  AccountType.RealEstate,
]);

interface AccountFormSheetProps {
  account?: Account | null;
  onClose: () => void;
  onSubmit: (data: CreateAccountRequest | UpdateAccountRequest) => Promise<void>;
}

export function AccountFormSheet({
  account,
  onClose,
  onSubmit,
}: AccountFormSheetProps) {
  const isEdit = !!account;
  const snapPoints = useMemo(() => ["85%"], []);

  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(
    account?.type ?? AccountType.Checking,
  );
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [currentBalance, setCurrentBalance] = useState(
    account?.currentBalance?.toString() ?? "",
  );
  const [interestRate, setInterestRate] = useState(
    account?.interestRate?.toString() ?? "",
  );
  const [isActive, setIsActive] = useState(account?.isActive ?? true);
  const [isFavorite, setIsFavorite] = useState(account?.isFavorite ?? false);
  const [excludeFromIncomeSources, setExcludeFromIncomeSources] = useState(
    account?.excludeFromIncomeSources ?? false,
  );

  // Advanced fields
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [accountNumber, setAccountNumber] = useState(
    account?.accountNumber ?? "",
  );
  const [dtiPercentage, setDtiPercentage] = useState(
    account?.dtiPercentage?.toString() ?? "100",
  );
  const [estimatedValue, setEstimatedValue] = useState(
    account?.estimatedValue?.toString() ?? "",
  );

  const [submitting, setSubmitting] = useState(false);

  const showInterestRate = INTEREST_RATE_TYPES.has(type);
  const showDti = DTI_TYPES.has(type);
  const showEstimatedValue = type === AccountType.RealEstate;

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        const data: UpdateAccountRequest = {};
        if (name !== account!.name) data.name = name;
        if (type !== account!.type) data.type = type;
        if (institution !== (account!.institution ?? ""))
          data.institution = institution;
        const balNum = currentBalance ? parseFloat(currentBalance) : 0;
        if (balNum !== account!.currentBalance) data.currentBalance = balNum;
        const rate = interestRate ? parseFloat(interestRate) : null;
        if (rate !== (account!.interestRate ?? null)) data.interestRate = rate;
        if (isActive !== account!.isActive) data.isActive = isActive;
        if (isFavorite !== account!.isFavorite) data.isFavorite = isFavorite;
        if (excludeFromIncomeSources !== account!.excludeFromIncomeSources)
          data.excludeFromIncomeSources = excludeFromIncomeSources;
        const acctNum = accountNumber || null;
        if (acctNum !== (account!.accountNumber ?? null))
          data.accountNumber = acctNum;
        const dtiPct = parseInt(dtiPercentage, 10) || 100;
        if (dtiPct !== (account!.dtiPercentage ?? 100))
          data.dtiPercentage = dtiPct;
        const estVal = estimatedValue ? parseFloat(estimatedValue) : null;
        if (estVal !== (account!.estimatedValue ?? null))
          data.estimatedValue = estVal;
        await onSubmit(data);
      } else {
        const data: CreateAccountRequest = {
          name,
          type,
          institution,
          currentBalance: currentBalance ? parseFloat(currentBalance) : 0,
        };
        if (interestRate) data.interestRate = parseFloat(interestRate);
        if (!isActive) data.isActive = false;
        if (isFavorite) data.isFavorite = true;
        if (excludeFromIncomeSources) data.excludeFromIncomeSources = true;
        if (accountNumber) data.accountNumber = accountNumber;
        const dtiPct = parseInt(dtiPercentage, 10) || 100;
        if (dtiPct !== 100) data.dtiPercentage = dtiPct;
        if (estimatedValue) data.estimatedValue = parseFloat(estimatedValue);
        await onSubmit(data);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    name, type, institution, currentBalance, interestRate, isActive,
    isFavorite, excludeFromIncomeSources, accountNumber, dtiPercentage,
    estimatedValue, isEdit, account, onSubmit, submitting,
  ]);

  return (
    <BottomSheet
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{isEdit ? "Edit Account" : "Add Account"}</Text>

        <FormField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Account name"
          autoFocus={!isEdit}
        />

        <PickerField
          label="Type"
          value={type}
          options={ACCOUNT_TYPE_OPTIONS}
          onValueChange={(v) => setType(v as AccountType)}
        />

        <FormField
          label="Institution"
          value={institution}
          onChangeText={setInstitution}
          placeholder="Optional"
        />

        <CurrencyInput
          label="Current Balance"
          value={currentBalance}
          onChangeText={setCurrentBalance}
        />

        {showInterestRate && (
          <FormField
            label="Interest Rate (%)"
            value={interestRate}
            onChangeText={setInterestRate}
            placeholder="Optional"
            keyboardType="decimal-pad"
          />
        )}

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Active</Text>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.foreground}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Favorite</Text>
          <Switch
            value={isFavorite}
            onValueChange={setIsFavorite}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.foreground}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Exclude from Income Sources</Text>
          <Switch
            value={excludeFromIncomeSources}
            onValueChange={setExcludeFromIncomeSources}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.foreground}
          />
        </View>

        {/* Advanced section */}
        <Pressable
          style={styles.advancedToggle}
          onPress={() => setShowAdvanced(!showAdvanced)}
          accessibilityRole="button"
        >
          <Text style={styles.advancedToggleText}>
            {showAdvanced ? "Hide Advanced" : "Show Advanced"}
          </Text>
        </Pressable>

        {showAdvanced && (
          <View>
            <FormField
              label="Account Number"
              value={accountNumber}
              onChangeText={setAccountNumber}
              placeholder="Optional"
            />

            {showDti && (
              <FormField
                label="DTI Percentage"
                value={dtiPercentage}
                onChangeText={setDtiPercentage}
                placeholder="100"
                keyboardType="number-pad"
              />
            )}

            {showEstimatedValue && (
              <CurrencyInput
                label="Estimated Value"
                value={estimatedValue}
                onChangeText={setEstimatedValue}
              />
            )}
          </View>
        )}

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <Pressable
            style={styles.cancelButton}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[
              styles.submitButton,
              (!name.trim() || submitting) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!name.trim() || submitting}
            accessibilityRole="button"
          >
            <Text style={styles.submitButtonText}>
              {submitting ? "Saving..." : isEdit ? "Save" : "Create"}
            </Text>
          </Pressable>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.card,
  },
  handle: {
    backgroundColor: colors.muted,
    width: 40,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  title: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  switchLabel: {
    color: colors.foreground,
    fontSize: 14,
    flex: 1,
  },
  advancedToggle: {
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  advancedToggleText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "500",
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  cancelButtonText: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  submitButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
});
