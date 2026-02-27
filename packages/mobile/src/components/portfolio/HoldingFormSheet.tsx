import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type {
  Holding,
  AssetClass,
  CreateHoldingRequest,
  UpdateHoldingRequest,
} from "@derekentringer/shared/finance";
import { ASSET_CLASS_LABELS } from "@derekentringer/shared/finance";
import { FormField } from "@/components/common/FormField";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { PickerField } from "@/components/common/PickerField";
import { colors, spacing, borderRadius } from "@/theme";

const ASSET_CLASS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "stocks", label: ASSET_CLASS_LABELS.stocks },
  { value: "bonds", label: ASSET_CLASS_LABELS.bonds },
  { value: "real_estate", label: ASSET_CLASS_LABELS.real_estate },
  { value: "cash", label: ASSET_CLASS_LABELS.cash },
  { value: "crypto", label: ASSET_CLASS_LABELS.crypto },
  { value: "other", label: ASSET_CLASS_LABELS.other },
];

interface HoldingFormSheetProps {
  holding?: Holding | null;
  accountId?: string;
  onClose: () => void;
  onSubmit: (
    data: CreateHoldingRequest | UpdateHoldingRequest,
  ) => Promise<void>;
}

export function HoldingFormSheet({
  holding,
  accountId,
  onClose,
  onSubmit,
}: HoldingFormSheetProps) {
  const isEdit = !!holding;
  const snapPoints = useMemo(() => ["85%"], []);

  const [name, setName] = useState(holding?.name ?? "");
  const [ticker, setTicker] = useState(holding?.ticker ?? "");
  const [assetClass, setAssetClass] = useState<AssetClass>(
    holding?.assetClass ?? "stocks",
  );
  const [shares, setShares] = useState(
    holding?.shares !== undefined ? String(holding.shares) : "",
  );
  const [costBasis, setCostBasis] = useState(
    holding?.costBasis !== undefined ? String(holding.costBasis) : "",
  );
  const [currentPrice, setCurrentPrice] = useState(
    holding?.currentPrice !== undefined ? String(holding.currentPrice) : "",
  );
  const [notes, setNotes] = useState(holding?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !shares || !currentPrice || submitting) return;
    setSubmitting(true);
    try {
      const sharesNum = parseFloat(shares) || 0;
      const costBasisNum = parseFloat(costBasis) || 0;
      const currentPriceNum = parseFloat(currentPrice) || 0;

      if (isEdit) {
        const data: UpdateHoldingRequest = {};
        if (name !== holding!.name) data.name = name;
        const t = ticker || null;
        if (t !== (holding!.ticker ?? null)) data.ticker = t;
        if (assetClass !== holding!.assetClass) data.assetClass = assetClass;
        if (sharesNum !== (holding!.shares ?? 0)) data.shares = sharesNum;
        if (costBasisNum !== (holding!.costBasis ?? 0))
          data.costBasis = costBasisNum;
        if (currentPriceNum !== (holding!.currentPrice ?? 0))
          data.currentPrice = currentPriceNum;
        const n = notes || null;
        if (n !== (holding!.notes ?? null)) data.notes = n;
        await onSubmit(data);
      } else {
        const data: CreateHoldingRequest = {
          accountId: accountId!,
          name,
          assetClass,
          shares: sharesNum,
          costBasis: costBasisNum,
          currentPrice: currentPriceNum,
        };
        if (ticker) data.ticker = ticker;
        if (notes) data.notes = notes;
        await onSubmit(data);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    name,
    ticker,
    assetClass,
    shares,
    costBasis,
    currentPrice,
    notes,
    isEdit,
    holding,
    accountId,
    onSubmit,
    submitting,
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
        <Text style={styles.title}>
          {isEdit ? "Edit Holding" : "Add Holding"}
        </Text>

        <FormField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Holding name"
          autoFocus={!isEdit}
        />

        <FormField
          label="Ticker"
          value={ticker}
          onChangeText={setTicker}
          placeholder="e.g. AAPL (optional)"
        />

        <PickerField
          label="Asset Class"
          value={assetClass}
          options={ASSET_CLASS_OPTIONS}
          onValueChange={(v) => setAssetClass(v as AssetClass)}
        />

        <FormField
          label="Shares"
          value={shares}
          onChangeText={setShares}
          placeholder="0"
          keyboardType="decimal-pad"
        />

        <CurrencyInput
          label="Cost Basis"
          value={costBasis}
          onChangeText={setCostBasis}
        />

        <CurrencyInput
          label="Current Price"
          value={currentPrice}
          onChangeText={setCurrentPrice}
        />

        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          multiline
        />

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
              (!name.trim() || !shares || !currentPrice || submitting) &&
                styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!name.trim() || !shares || !currentPrice || submitting}
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
