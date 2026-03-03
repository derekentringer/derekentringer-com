import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, Text, Dimensions, StyleSheet } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { AccountType } from "@derekentringer/shared/finance";
import type { HysVsDebtResult } from "@derekentringer/shared/finance";
import { useAccounts } from "@/hooks/useAccounts";
import { calculateHysVsDebt } from "@/lib/calculations";
import { Card } from "@/components/common/Card";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { FormField } from "@/components/common/FormField";
import { PickerField } from "@/components/common/PickerField";
import { CHART_COLORS, formatCurrency, formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

const Y_AXIS_WIDTH = 50;
const CHART_WIDTH = Dimensions.get("window").width - 64 - Y_AXIS_WIDTH;

export function HysVsDebtTab() {
  const { data: accountsData } = useAccounts();

  const savingsAccounts = useMemo(() => {
    if (!accountsData?.accounts) return [];
    return accountsData.accounts.filter(
      (a) =>
        a.type === AccountType.Savings ||
        a.type === AccountType.HighYieldSavings,
    );
  }, [accountsData]);

  const loanAccounts = useMemo(() => {
    if (!accountsData?.accounts) return [];
    return accountsData.accounts.filter(
      (a) => a.type === AccountType.Loan,
    );
  }, [accountsData]);

  const savingsOptions = useMemo(
    () => [
      { value: "manual", label: "Manual Entry" },
      ...savingsAccounts.map((a) => ({ value: a.id, label: a.name })),
    ],
    [savingsAccounts],
  );

  const loanOptions = useMemo(
    () => [
      { value: "manual", label: "Manual Entry" },
      ...loanAccounts.map((a) => ({ value: a.id, label: a.name })),
    ],
    [loanAccounts],
  );

  const [savingsAccountId, setSavingsAccountId] = useState("manual");
  const [loanAccountId, setLoanAccountId] = useState("manual");

  const [hysBalance, setHysBalance] = useState("");
  const [hysApy, setHysApy] = useState("");
  const [loanBalance, setLoanBalance] = useState("");
  const [loanApr, setLoanApr] = useState("");
  const [monthlyPayment, setMonthlyPayment] = useState("");

  // Pre-populate from selected accounts
  useEffect(() => {
    if (savingsAccountId !== "manual") {
      const acct = savingsAccounts.find((a) => a.id === savingsAccountId);
      if (acct) {
        setHysBalance(String(Math.abs(acct.currentBalance)));
        if (acct.interestRate) setHysApy(String(acct.interestRate));
      }
    }
  }, [savingsAccountId, savingsAccounts]);

  useEffect(() => {
    if (loanAccountId !== "manual") {
      const acct = loanAccounts.find((a) => a.id === loanAccountId);
      if (acct) {
        setLoanBalance(String(Math.abs(acct.currentBalance)));
        if (acct.interestRate) setLoanApr(String(acct.interestRate));
      }
    }
  }, [loanAccountId, loanAccounts]);

  // Debounced calculation
  const [result, setResult] = useState<HysVsDebtResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const hb = parseFloat(hysBalance);
    const ha = parseFloat(hysApy);
    const lb = parseFloat(loanBalance);
    const la = parseFloat(loanApr);
    const mp = parseFloat(monthlyPayment);

    if (hb > 0 && ha >= 0 && lb > 0 && la >= 0 && mp > 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setResult(
          calculateHysVsDebt({
            hysBalance: hb,
            hysApy: ha,
            loanBalance: lb,
            loanApr: la,
            monthlyPayment: mp,
          }),
        );
      }, 300);
    } else {
      setResult(null);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hysBalance, hysApy, loanBalance, loanApr, monthlyPayment]);

  // Chart data — sample if too many points
  const chartData = useMemo(() => {
    if (!result) return { scenarioA: [], scenarioB: [] };
    const schedule = result.schedule;
    const step = schedule.length > 60 ? Math.ceil(schedule.length / 60) : 1;
    const sampled = schedule.filter((_, i) => i % step === 0);
    const scenarioA = sampled.map((p, i) => ({
      value: p.scenarioA_netPosition,
      label:
        i % Math.ceil(sampled.length / 5) === 0 ? p.label : "",
    }));
    const scenarioB = sampled.map((p) => ({
      value: p.scenarioB_netPosition,
      label: "",
    }));
    return { scenarioA, scenarioB };
  }, [result]);

  const chartMaxValue = useMemo(() => {
    let max = 0;
    for (const p of chartData.scenarioA) {
      if (Math.abs(p.value) > max) max = Math.abs(p.value);
    }
    for (const p of chartData.scenarioB) {
      if (Math.abs(p.value) > max) max = Math.abs(p.value);
    }
    return max * 1.1 || 100;
  }, [chartData]);

  return (
    <View style={styles.container}>
      {/* Account selectors */}
      <Card>
        <PickerField
          label="Savings Account"
          value={savingsAccountId}
          options={savingsOptions}
          onValueChange={setSavingsAccountId}
        />
        <PickerField
          label="Loan Account"
          value={loanAccountId}
          options={loanOptions}
          onValueChange={setLoanAccountId}
        />
      </Card>

      {/* Inputs */}
      <Card>
        <CurrencyInput
          label="HYS Balance"
          value={hysBalance}
          onChangeText={setHysBalance}
        />
        <FormField
          label="HYS APY %"
          value={hysApy}
          onChangeText={setHysApy}
          placeholder="e.g. 4.5"
          keyboardType="decimal-pad"
        />
        <CurrencyInput
          label="Loan Balance"
          value={loanBalance}
          onChangeText={setLoanBalance}
        />
        <FormField
          label="Loan APR %"
          value={loanApr}
          onChangeText={setLoanApr}
          placeholder="e.g. 6.5"
          keyboardType="decimal-pad"
        />
        <CurrencyInput
          label="Monthly Payment"
          value={monthlyPayment}
          onChangeText={setMonthlyPayment}
        />
      </Card>

      {/* Results */}
      {result && (
        <>
          <Card>
            <View style={styles.kpiGrid}>
              <View style={styles.kpiItem}>
                <Text style={styles.kpiLabel}>Recommendation</Text>
                <View
                  style={[
                    styles.recommendBadge,
                    {
                      backgroundColor:
                        result.recommendation === "pay-loan"
                          ? colors.success + "20"
                          : "#f59e0b20",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.recommendText,
                      {
                        color:
                          result.recommendation === "pay-loan"
                            ? colors.success
                            : "#f59e0b",
                      },
                    ]}
                  >
                    {result.recommendation === "pay-loan"
                      ? "Pay Loan"
                      : "Keep HYS"}
                  </Text>
                </View>
              </View>
              <View style={styles.kpiItem}>
                <Text style={styles.kpiLabel}>Net Benefit</Text>
                <Text
                  style={[
                    styles.kpiValue,
                    {
                      color:
                        result.netBenefit >= 0
                          ? colors.success
                          : colors.error,
                    },
                  ]}
                >
                  {formatCurrencyFull(Math.abs(result.netBenefit))}
                </Text>
              </View>
              <View style={styles.kpiItem}>
                <Text style={styles.kpiLabel}>Break-Even</Text>
                <Text style={styles.kpiValue}>
                  {result.breakEvenMonth !== null
                    ? `Month ${result.breakEvenMonth}`
                    : "N/A"}
                </Text>
              </View>
              <View style={styles.kpiItem}>
                <Text style={styles.kpiLabel}>Interest Delta</Text>
                <Text style={styles.kpiValue}>
                  {formatCurrencyFull(
                    result.scenarioB_totalInterestPaid -
                      result.scenarioA_totalInterestPaid,
                  )}
                </Text>
              </View>
            </View>
          </Card>

          {chartData.scenarioA.length > 1 && (
            <Card>
              <Text style={styles.chartTitle}>Net Position Over Time</Text>
              <LineChart
                data={chartData.scenarioA}
                dataSet={[
                  {
                    data: chartData.scenarioB,
                    color: colors.success,
                    thickness: 2,
                  },
                ]}
                width={CHART_WIDTH}
                height={220}
                color="#f59e0b"
                thickness={2}
                hideDataPoints
                curved
                areaChart
                startFillColor="#f59e0b"
                startOpacity={0.1}
                endOpacity={0}
                yAxisLabelWidth={Y_AXIS_WIDTH}
                yAxisTextStyle={styles.axisText}
                xAxisLabelTextStyle={styles.axisText}
                rulesColor={CHART_COLORS.grid}
                yAxisColor="transparent"
                xAxisColor="transparent"
                formatYLabel={(v: string) => formatCurrency(Number(v))}
                noOfSections={4}
                maxValue={chartMaxValue}
                disableScroll
                adjustToWidth
                isAnimated={false}
              />
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: "#f59e0b" },
                    ]}
                  />
                  <Text style={styles.legendText}>Keep HYS</Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: colors.success },
                    ]}
                  />
                  <Text style={styles.legendText}>Pay Loan</Text>
                </View>
              </View>
            </Card>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  kpiItem: {
    width: "48%",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  kpiLabel: {
    color: colors.muted,
    fontSize: 11,
    marginBottom: 2,
  },
  kpiValue: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600",
  },
  recommendBadge: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  recommendText: {
    fontSize: 13,
    fontWeight: "700",
  },
  chartTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  axisText: {
    color: colors.muted,
    fontSize: 9,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: colors.muted,
    fontSize: 10,
  },
});
