import React, { useCallback, useMemo, useRef } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { BottomSheetModal, BottomSheetFlatList, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { colors, spacing, borderRadius } from "@/theme";

interface TransactionFiltersProps {
  accountId: string | undefined;
  category: string | undefined;
  startDate: string | undefined;
  endDate: string | undefined;
  onAccountChange: (accountId: string | undefined) => void;
  onCategoryChange: (category: string | undefined) => void;
  onDateRangeChange: (startDate: string | undefined, endDate: string | undefined) => void;
  onClearAll: () => void;
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ name: string }>;
}

interface DatePreset {
  label: string;
  getRange: () => { startDate: string; endDate: string };
}

function getDatePresets(): DatePreset[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  return [
    {
      label: "This Month",
      getRange: () => {
        const start = new Date(year, month, 1);
        return {
          startDate: start.toISOString().split("T")[0],
          endDate: now.toISOString().split("T")[0],
        };
      },
    },
    {
      label: "Last Month",
      getRange: () => {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0);
        return {
          startDate: start.toISOString().split("T")[0],
          endDate: end.toISOString().split("T")[0],
        };
      },
    },
    {
      label: "Last 3 Months",
      getRange: () => {
        const start = new Date(year, month - 3, 1);
        return {
          startDate: start.toISOString().split("T")[0],
          endDate: now.toISOString().split("T")[0],
        };
      },
    },
    {
      label: "Last 6 Months",
      getRange: () => {
        const start = new Date(year, month - 6, 1);
        return {
          startDate: start.toISOString().split("T")[0],
          endDate: now.toISOString().split("T")[0],
        };
      },
    },
    {
      label: "This Year",
      getRange: () => ({
        startDate: `${year}-01-01`,
        endDate: now.toISOString().split("T")[0],
      }),
    },
  ];
}

function getDateRangeLabel(startDate: string | undefined, endDate: string | undefined): string | null {
  if (!startDate && !endDate) return null;
  const presets = getDatePresets();
  for (const preset of presets) {
    const range = preset.getRange();
    if (range.startDate === startDate && range.endDate === endDate) {
      return preset.label;
    }
  }
  return "Custom";
}

export function TransactionFilters({
  accountId,
  category,
  startDate,
  endDate,
  onAccountChange,
  onCategoryChange,
  onDateRangeChange,
  onClearAll,
  accounts,
  categories,
}: TransactionFiltersProps) {
  const accountSheetRef = useRef<BottomSheetModal>(null);
  const categorySheetRef = useRef<BottomSheetModal>(null);
  const dateSheetRef = useRef<BottomSheetModal>(null);

  const snapPoints = useMemo(() => ["45%"], []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
    [],
  );

  const hasActiveFilter = accountId || category || startDate || endDate;

  const selectedAccountName = useMemo(() => {
    if (!accountId) return null;
    return accounts.find((a) => a.id === accountId)?.name ?? "Unknown";
  }, [accountId, accounts]);

  const dateRangeLabel = useMemo(
    () => getDateRangeLabel(startDate, endDate),
    [startDate, endDate],
  );

  const datePresets = useMemo(() => getDatePresets(), []);

  const handleAccountPress = useCallback(() => {
    Haptics.selectionAsync();
    accountSheetRef.current?.present();
  }, []);

  const handleCategoryPress = useCallback(() => {
    Haptics.selectionAsync();
    categorySheetRef.current?.present();
  }, []);

  const handleDatePress = useCallback(() => {
    Haptics.selectionAsync();
    dateSheetRef.current?.present();
  }, []);

  const handleAccountSelect = useCallback(
    (id: string | undefined) => {
      onAccountChange(id);
      accountSheetRef.current?.dismiss();
    },
    [onAccountChange],
  );

  const handleCategorySelect = useCallback(
    (name: string | undefined) => {
      onCategoryChange(name);
      categorySheetRef.current?.dismiss();
    },
    [onCategoryChange],
  );

  const handleDatePresetSelect = useCallback(
    (preset: DatePreset | null) => {
      if (!preset) {
        onDateRangeChange(undefined, undefined);
      } else {
        const range = preset.getRange();
        onDateRangeChange(range.startDate, range.endDate);
      }
      dateSheetRef.current?.dismiss();
    },
    [onDateRangeChange],
  );

  const accountOptions = useMemo(
    () => [{ id: "__all__", name: "All Accounts" }, ...accounts],
    [accounts],
  );

  const categoryOptions = useMemo(
    () => [{ name: "All Categories" }, ...categories],
    [categories],
  );

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        <Pressable
          style={[styles.chip, accountId ? styles.chipActive : styles.chipInactive]}
          onPress={handleAccountPress}
          accessibilityRole="button"
          accessibilityLabel={selectedAccountName ? `Account: ${selectedAccountName}` : "Filter by account"}
        >
          <Text style={[styles.chipText, accountId ? styles.chipTextActive : styles.chipTextInactive]}>
            {selectedAccountName ?? "Account"}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.chip, category ? styles.chipActive : styles.chipInactive]}
          onPress={handleCategoryPress}
          accessibilityRole="button"
          accessibilityLabel={category ? `Category: ${category}` : "Filter by category"}
        >
          <Text style={[styles.chipText, category ? styles.chipTextActive : styles.chipTextInactive]}>
            {category ?? "Category"}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.chip, dateRangeLabel ? styles.chipActive : styles.chipInactive]}
          onPress={handleDatePress}
          accessibilityRole="button"
          accessibilityLabel={dateRangeLabel ? `Date: ${dateRangeLabel}` : "Filter by date range"}
        >
          <Text style={[styles.chipText, dateRangeLabel ? styles.chipTextActive : styles.chipTextInactive]}>
            {dateRangeLabel ?? "Date Range"}
          </Text>
        </Pressable>

        {hasActiveFilter && (
          <Pressable
            style={[styles.chip, styles.chipClear]}
            onPress={() => {
              Haptics.selectionAsync();
              onClearAll();
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Text style={styles.chipTextClear}>Clear All</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Account picker sheet */}
      <BottomSheetModal
        ref={accountSheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select Account</Text>
        </View>
        <BottomSheetFlatList
          data={accountOptions}
          keyExtractor={(item: { id: string; name: string }) => item.id}
          renderItem={({ item }: { item: { id: string; name: string } }) => {
            const isAll = item.id === "__all__";
            const isSelected = isAll ? !accountId : accountId === item.id;
            return (
              <Pressable
                style={[styles.sheetRow, isSelected && styles.sheetRowSelected]}
                onPress={() => handleAccountSelect(isAll ? undefined : item.id)}
                accessibilityRole="button"
              >
                <Text style={[styles.sheetRowText, isSelected && styles.sheetRowTextSelected]}>
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
        />
      </BottomSheetModal>

      {/* Category picker sheet */}
      <BottomSheetModal
        ref={categorySheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select Category</Text>
        </View>
        <BottomSheetFlatList
          data={categoryOptions}
          keyExtractor={(item: { name: string }) => item.name}
          renderItem={({ item }: { item: { name: string } }) => {
            const isAll = item.name === "All Categories";
            const isSelected = isAll ? !category : category === item.name;
            return (
              <Pressable
                style={[styles.sheetRow, isSelected && styles.sheetRowSelected]}
                onPress={() => handleCategorySelect(isAll ? undefined : item.name)}
                accessibilityRole="button"
              >
                <Text style={[styles.sheetRowText, isSelected && styles.sheetRowTextSelected]}>
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
        />
      </BottomSheetModal>

      {/* Date range picker sheet */}
      <BottomSheetModal
        ref={dateSheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select Date Range</Text>
        </View>
        <BottomSheetFlatList
          data={[null, ...datePresets]}
          keyExtractor={(item: DatePreset | null, index: number) => (item ? item.label : `all-${index}`)}
          renderItem={({ item }: { item: DatePreset | null }) => {
            const isAllTime = item === null;
            const isSelected = isAllTime
              ? !startDate && !endDate
              : getDateRangeLabel(startDate, endDate) === item.label;
            return (
              <Pressable
                style={[styles.sheetRow, isSelected && styles.sheetRowSelected]}
                onPress={() => handleDatePresetSelect(item)}
                accessibilityRole="button"
              >
                <Text style={[styles.sheetRowText, isSelected && styles.sheetRowTextSelected]}>
                  {isAllTime ? "All Time" : item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipInactive: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipClear: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.destructive,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  chipTextActive: {
    color: "#ffffff",
  },
  chipTextInactive: {
    color: colors.muted,
  },
  chipTextClear: {
    color: colors.destructive,
    fontSize: 13,
    fontWeight: "500",
  },
  sheetBg: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: {
    backgroundColor: colors.muted,
    width: 40,
  },
  sheetHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sheetTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "700",
  },
  sheetRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetRowSelected: {
    backgroundColor: colors.border,
  },
  sheetRowText: {
    color: colors.foreground,
    fontSize: 14,
  },
  sheetRowTextSelected: {
    color: colors.primary,
    fontWeight: "600",
  },
});
