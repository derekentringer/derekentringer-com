import React, { useState, useMemo, useRef, useEffect } from "react";
import { View, Text, Dimensions, StyleSheet } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { AccountType } from "@derekentringer/shared/finance";
import type { FourOhOneKResult } from "@derekentringer/shared/finance";
import { useAccounts } from "@/hooks/useAccounts";
import { calculateFourOhOneK, IRS_401K_LIMIT } from "@/lib/calculations";
import { Card } from "@/components/common/Card";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { FormField } from "@/components/common/FormField";
import { PickerField } from "@/components/common/PickerField";
import { Slider } from "@/components/common/Slider";
import { CHART_COLORS, formatCurrency, formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

const Y_AXIS_WIDTH = 50;
const CHART_WIDTH = Dimensions.get("window").width - 64 - Y_AXIS_WIDTH;

export function FourOhOneKTab() {
  const { data: accountsData } = useAccounts();

  const investmentAccounts = useMemo(() => {
    if (!accountsData?.accounts) return [];
    return accountsData.accounts.filter(
      (a) => a.type === AccountType.Investment,
    );
  }, [accountsData]);

  const accountOptions = useMemo(
    () => [
      { value: "manual", label: "Manual Entry" },
      ...investmentAccounts.map((a) => ({ value: a.id, label: a.name })),
    ],
    [investmentAccounts],
  );

  const [selectedAccountId, setSelectedAccountId] = useState("manual");
  const [annualSalary, setAnnualSalary] = useState("");
  const [contributionPct, setContributionPct] = useState(6);
  const [employerMatchPct, setEmployerMatchPct] = useState("");
  const [matchCapPct, setMatchCapPct] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("7");
  const [currentBalance, setCurrentBalance] = useState("");

  // Pre-populate from selected account
  useEffect(() => {
    if (selectedAccountId !== "manual") {
      const acct = investmentAccounts.find((a) => a.id === selectedAccountId);
      if (acct) {
        setCurrentBalance(String(Math.abs(acct.currentBalance)));
      }
    }
  }, [selectedAccountId, investmentAccounts]);

  // Debounced calculation
  const [result, setResult] = useState<FourOhOneKResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const salary = parseFloat(annualSalary);
    const match = parseFloat(employerMatchPct);
    const cap = parseFloat(matchCapPct);
    const ret = parseFloat(expectedReturn);
    const balance = parseFloat(currentBalance) || 0;

    if (salary > 0 && match >= 0 && cap >= 0 && ret > 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setResult(
          calculateFourOhOneK({
            annualSalary: salary,
            currentContributionPct: contributionPct,
            employerMatchPct: match,
            employerMatchCapPct: cap,
            expectedAnnualReturnPct: ret,
            currentBalance: balance,
          }),
        );
      }, 300);
    } else {
      setResult(null);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    annualSalary,
    contributionPct,
    employerMatchPct,
    matchCapPct,
    expectedReturn,
    currentBalance,
  ]);

  // Chart data
  const chartData = useMemo(() => {
    if (!result) return { current: [], optimal: [], max: [] };
    const current = result.projection.map((p, i) => ({
      value: p.currentBalance,
      label: i % 5 === 0 ? p.label : "",
    }));
    const optimal = result.projection.map((p) => ({
      value: p.optimalBalance,
      label: "",
    }));
    const max = result.projection.map((p) => ({
      value: p.maxBalance,
      label: "",
    }));
    return { current, optimal, max };
  }, [result]);

  const chartMaxValue = useMemo(() => {
    let maxVal = 0;
    for (const p of chartData.max) {
      if (p.value > maxVal) maxVal = p.value;
    }
    return maxVal * 1.1 || 100;
  }, [chartData]);

  return (
    <View style={styles.container}>
      {/* Account selector */}
      <Card>
        <PickerField
          label="Retirement Account"
          value={selectedAccountId}
          options={accountOptions}
          onValueChange={setSelectedAccountId}
        />
      </Card>

      {/* Inputs */}
      <Card>
        <CurrencyInput
          label="Annual Salary"
          value={annualSalary}
          onChangeText={setAnnualSalary}
        />
        <Slider
          label="Contribution %"
          value={contributionPct}
          min={0}
          max={50}
          step={1}
          onValueChange={setContributionPct}
          formatValue={(v) => `${v}%`}
        />
        <FormField
          label="Employer Match %"
          value={employerMatchPct}
          onChangeText={setEmployerMatchPct}
          placeholder="e.g. 100"
          keyboardType="decimal-pad"
        />
        <FormField
          label="Match Cap %"
          value={matchCapPct}
          onChangeText={setMatchCapPct}
          placeholder="e.g. 6"
          keyboardType="decimal-pad"
        />
        <FormField
          label="Expected Return %"
          value={expectedReturn}
          onChangeText={setExpectedReturn}
          placeholder="e.g. 7"
          keyboardType="decimal-pad"
        />
        <CurrencyInput
          label="Current Balance"
          value={currentBalance}
          onChangeText={setCurrentBalance}
        />
      </Card>

      {/* Results */}
      {result && (
        <>
          <Card>
            <View style={styles.kpiGrid}>
              <View style={styles.kpiItem}>
                <Text style={styles.kpiLabel}>Annual Contribution</Text>
                <Text style={[styles.kpiValue, { color: colors.primary }]}>
                  {formatCurrencyFull(result.currentAnnualContribution)}
                </Text>
              </View>
              <View style={styles.kpiItem}>
                <Text style={styles.kpiLabel}>Employer Match</Text>
                <Text style={[styles.kpiValue, { color: colors.success }]}>
                  {formatCurrencyFull(result.currentEmployerMatch)}
                </Text>
              </View>
              <View style={styles.kpiItem}>
                <Text style={styles.kpiLabel}>Left on Table</Text>
                <Text
                  style={[
                    styles.kpiValue,
                    {
                      color:
                        result.moneyLeftOnTable > 0
                          ? colors.error
                          : colors.success,
                    },
                  ]}
                >
                  {formatCurrencyFull(result.moneyLeftOnTable)}
                </Text>
              </View>
              <View style={styles.kpiItem}>
                <Text style={styles.kpiLabel}>Optimal %</Text>
                <Text style={styles.kpiValue}>
                  {result.optimalContributionPct}%
                </Text>
              </View>
            </View>
          </Card>

          {chartData.current.length > 1 && (
            <Card>
              <Text style={styles.chartTitle}>30-Year Projection</Text>
              <LineChart
                data={chartData.current}
                dataSet={[
                  {
                    data: chartData.optimal,
                    color: colors.success,
                    thickness: 2,
                  },
                  {
                    data: chartData.max,
                    color: "#8b5cf6",
                    thickness: 1.5,
                  },
                ]}
                width={CHART_WIDTH}
                height={220}
                color={CHART_COLORS.netWorth}
                thickness={2}
                hideDataPoints
                curved
                areaChart
                startFillColor={CHART_COLORS.netWorth}
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
                      { backgroundColor: CHART_COLORS.netWorth },
                    ]}
                  />
                  <Text style={styles.legendText}>Current</Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: colors.success },
                    ]}
                  />
                  <Text style={styles.legendText}>Optimal</Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: "#8b5cf6" },
                    ]}
                  />
                  <Text style={styles.legendText}>IRS Max</Text>
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
