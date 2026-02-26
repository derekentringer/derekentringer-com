import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, Switch, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type {
  Bill,
  BillFrequency,
  CreateBillRequest,
  UpdateBillRequest,
} from "@derekentringer/shared/finance";
import {
  BILL_FREQUENCIES,
  BILL_FREQUENCY_LABELS,
} from "@derekentringer/shared/finance";
import { useCategories } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { FormField } from "@/components/common/FormField";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { PickerField } from "@/components/common/PickerField";
import { colors, spacing, borderRadius } from "@/theme";

const MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const WEEKDAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const FREQUENCY_OPTIONS = BILL_FREQUENCIES.map((f) => ({
  value: f,
  label: BILL_FREQUENCY_LABELS[f],
}));

function computeNextDates(
  frequency: string,
  dueDay: number,
  dueMonth?: number,
  dueWeekday?: number,
): Date[] {
  const dates: Date[] = [];
  const now = new Date();

  if (frequency === "monthly") {
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const day = Math.min(
        dueDay,
        new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
      );
      const date = new Date(d.getFullYear(), d.getMonth(), day);
      if (date >= now || dates.length < 3) dates.push(date);
      if (dates.length >= 3) break;
    }
  } else if (frequency === "quarterly") {
    for (let i = 0; i < 12 && dates.length < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      if (d.getMonth() % 3 === 0) {
        const day = Math.min(
          dueDay,
          new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
        );
        dates.push(new Date(d.getFullYear(), d.getMonth(), day));
      }
    }
  } else if (frequency === "yearly" && dueMonth) {
    const month = dueMonth - 1;
    for (let y = now.getFullYear(); dates.length < 3; y++) {
      const day = Math.min(
        dueDay,
        new Date(y, month + 1, 0).getDate(),
      );
      const date = new Date(y, month, day);
      if (date >= now || dates.length === 0) dates.push(date);
    }
  } else if (
    (frequency === "weekly" || frequency === "biweekly") &&
    dueWeekday !== undefined
  ) {
    const cursor = new Date(now);
    const diff = (dueWeekday - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + diff);
    const inc = frequency === "biweekly" ? 14 : 7;
    for (let i = 0; i < 3; i++) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + inc);
    }
  }

  return dates.slice(0, 3);
}

interface BillFormSheetProps {
  bill?: Bill | null;
  onClose: () => void;
  onSubmit: (data: CreateBillRequest | UpdateBillRequest) => Promise<void>;
}

export function BillFormSheet({ bill, onClose, onSubmit }: BillFormSheetProps) {
  const isEdit = !!bill;
  const snapPoints = useMemo(() => ["85%"], []);

  const [name, setName] = useState(bill?.name ?? "");
  const [amount, setAmount] = useState(bill?.amount?.toString() ?? "");
  const [frequency, setFrequency] = useState<BillFrequency>(
    bill?.frequency ?? "monthly",
  );
  const [dueDay, setDueDay] = useState(bill?.dueDay?.toString() ?? "1");
  const [dueMonth, setDueMonth] = useState(bill?.dueMonth?.toString() ?? "");
  const [dueWeekday, setDueWeekday] = useState(
    bill?.dueWeekday?.toString() ?? "1",
  );
  const [category, setCategory] = useState(bill?.category ?? "");
  const [accountId, setAccountId] = useState(bill?.accountId ?? "");
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const [isActive, setIsActive] = useState(bill?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);

  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts();

  const categoryOptions = useMemo(() => {
    const opts = [{ value: "", label: "None" }];
    if (categoriesQuery.data) {
      categoriesQuery.data.categories.forEach((c) =>
        opts.push({ value: c.name, label: c.name }),
      );
    }
    return opts;
  }, [categoriesQuery.data]);

  const accountOptions = useMemo(() => {
    const opts = [{ value: "", label: "None" }];
    if (accountsQuery.data) {
      accountsQuery.data.accounts.forEach((a) =>
        opts.push({ value: a.id, label: a.name }),
      );
    }
    return opts;
  }, [accountsQuery.data]);

  const showDayOfMonth = frequency === "monthly" || frequency === "quarterly";
  const showYearlyFields = frequency === "yearly";
  const showWeekday = frequency === "weekly" || frequency === "biweekly";

  const nextDates = useMemo(() => {
    const day = parseInt(dueDay) || 1;
    const month = dueMonth ? parseInt(dueMonth) : undefined;
    const weekday = dueWeekday ? parseInt(dueWeekday) : undefined;
    return computeNextDates(frequency, day, month, weekday);
  }, [frequency, dueDay, dueMonth, dueWeekday]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !amount || submitting) return;
    setSubmitting(true);
    try {
      const dayNum = parseInt(dueDay) || 1;
      const amountNum = parseFloat(amount) || 0;

      if (isEdit) {
        const data: UpdateBillRequest = {};
        if (name !== bill!.name) data.name = name;
        if (amountNum !== bill!.amount) data.amount = amountNum;
        if (frequency !== bill!.frequency) data.frequency = frequency;
        if (dayNum !== bill!.dueDay) data.dueDay = dayNum;

        if (showYearlyFields) {
          const monthNum = dueMonth ? parseInt(dueMonth) : null;
          if (monthNum !== (bill!.dueMonth ?? null)) data.dueMonth = monthNum;
        } else if (bill!.dueMonth) {
          data.dueMonth = null;
        }

        if (showWeekday) {
          const weekdayNum = parseInt(dueWeekday);
          if (weekdayNum !== (bill!.dueWeekday ?? null))
            data.dueWeekday = weekdayNum;
        } else if (
          bill!.dueWeekday !== undefined &&
          bill!.dueWeekday !== null
        ) {
          data.dueWeekday = null;
        }

        const cat = category || null;
        if (cat !== (bill!.category ?? null)) data.category = cat;
        const acct = accountId || null;
        if (acct !== (bill!.accountId ?? null)) data.accountId = acct;
        const n = notes || null;
        if (n !== (bill!.notes ?? null)) data.notes = n;
        if (isActive !== bill!.isActive) data.isActive = isActive;

        await onSubmit(data);
      } else {
        const data: CreateBillRequest = {
          name,
          amount: amountNum,
          frequency,
          dueDay: dayNum,
        };
        if (showYearlyFields && dueMonth)
          data.dueMonth = parseInt(dueMonth);
        if (showWeekday) data.dueWeekday = parseInt(dueWeekday);
        if (category) data.category = category;
        if (accountId) data.accountId = accountId;
        if (notes) data.notes = notes;
        if (!isActive) data.isActive = false;
        await onSubmit(data);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    name, amount, frequency, dueDay, dueMonth, dueWeekday,
    category, accountId, notes, isActive, isEdit, bill,
    onSubmit, submitting, showYearlyFields, showWeekday,
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
          {isEdit ? "Edit Bill" : "Add Bill"}
        </Text>

        <FormField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Bill name"
          autoFocus={!isEdit}
        />

        <CurrencyInput
          label="Amount"
          value={amount}
          onChangeText={setAmount}
        />

        <PickerField
          label="Frequency"
          value={frequency}
          options={FREQUENCY_OPTIONS}
          onValueChange={(v) => setFrequency(v as BillFrequency)}
        />

        {showDayOfMonth && (
          <FormField
            label="Day of Month"
            value={dueDay}
            onChangeText={setDueDay}
            placeholder="1"
            keyboardType="number-pad"
          />
        )}

        {showYearlyFields && (
          <>
            <PickerField
              label="Month"
              value={dueMonth}
              options={MONTH_OPTIONS}
              onValueChange={setDueMonth}
              placeholder="Select month"
            />
            <FormField
              label="Day of Month"
              value={dueDay}
              onChangeText={setDueDay}
              placeholder="1"
              keyboardType="number-pad"
            />
          </>
        )}

        {showWeekday && (
          <PickerField
            label="Day of Week"
            value={dueWeekday}
            options={WEEKDAY_OPTIONS}
            onValueChange={setDueWeekday}
          />
        )}

        {nextDates.length > 0 && (
          <Text style={styles.nextDatesText}>
            Next dates:{" "}
            {nextDates
              .map((d) =>
                d.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }),
              )
              .join(", ")}
          </Text>
        )}

        <PickerField
          label="Category"
          value={category}
          options={categoryOptions}
          onValueChange={setCategory}
          placeholder="None"
        />

        <PickerField
          label="Account"
          value={accountId}
          options={accountOptions}
          onValueChange={setAccountId}
          placeholder="None"
        />

        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          multiline
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Active</Text>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.foreground}
          />
        </View>

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
              (!name.trim() || !amount || submitting) &&
                styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!name.trim() || !amount || submitting}
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
  nextDatesText: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: spacing.sm,
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
