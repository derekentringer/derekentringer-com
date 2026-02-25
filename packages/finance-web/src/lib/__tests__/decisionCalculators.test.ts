import { describe, it, expect } from "vitest";
import { calculateHysVsDebt, calculateFourOhOneK } from "../decisionCalculators";

describe("calculateHysVsDebt", () => {
  it("recommends paying loan when APR > APY", () => {
    const result = calculateHysVsDebt({
      hysBalance: 50000,
      hysApy: 4.5,
      loanBalance: 50000,
      loanApr: 7.0,
      monthlyPayment: 1000,
    });

    expect(result.recommendation).toBe("pay-loan");
    expect(result.netBenefit).toBeGreaterThan(0);
    expect(result.breakEvenMonth).toBeDefined();
    expect(result.breakEvenMonth).toBeGreaterThanOrEqual(1);
  });

  it("recommends keeping HYS when APY > APR", () => {
    const result = calculateHysVsDebt({
      hysBalance: 50000,
      hysApy: 8.0,
      loanBalance: 50000,
      loanApr: 3.0,
      monthlyPayment: 1000,
    });

    expect(result.recommendation).toBe("keep-hys");
    expect(result.netBenefit).toBeLessThanOrEqual(0);
  });

  it("handles HYS balance greater than loan balance", () => {
    const result = calculateHysVsDebt({
      hysBalance: 100000,
      hysApy: 4.5,
      loanBalance: 30000,
      loanApr: 7.0,
      monthlyPayment: 500,
    });

    expect(result.schedule.length).toBeGreaterThan(1);
    // Scenario B should fully pay off the loan at month 0
    expect(result.schedule[0].scenarioB_loanBalance).toBe(0);
    expect(result.schedule[0].scenarioB_hysBalance).toBe(70000);
  });

  it("handles zero balances gracefully", () => {
    const result = calculateHysVsDebt({
      hysBalance: 0,
      hysApy: 4.5,
      loanBalance: 0,
      loanApr: 7.0,
      monthlyPayment: 1000,
    });

    expect(result.schedule.length).toBeGreaterThan(0);
    expect(result.scenarioA_totalInterestPaid).toBe(0);
    expect(result.scenarioB_totalInterestPaid).toBe(0);
  });

  it("produces correct break-even month", () => {
    const result = calculateHysVsDebt({
      hysBalance: 20000,
      hysApy: 4.0,
      loanBalance: 20000,
      loanApr: 6.5,
      monthlyPayment: 500,
    });

    expect(result.recommendation).toBe("pay-loan");
    if (result.breakEvenMonth !== null) {
      const beforeBreakEven = result.schedule[result.breakEvenMonth - 1];
      const atBreakEven = result.schedule[result.breakEvenMonth];
      // Before break-even, A should be >= B
      expect(beforeBreakEven.scenarioA_netPosition).toBeGreaterThanOrEqual(
        beforeBreakEven.scenarioB_netPosition - 0.02,
      );
      // At break-even, B should exceed A
      expect(atBreakEven.scenarioB_netPosition).toBeGreaterThan(
        atBreakEven.scenarioA_netPosition,
      );
    }
  });

  it("tracks cumulative interest correctly", () => {
    const result = calculateHysVsDebt({
      hysBalance: 10000,
      hysApy: 5.0,
      loanBalance: 10000,
      loanApr: 6.0,
      monthlyPayment: 500,
    });

    expect(result.scenarioA_totalInterestEarned).toBeGreaterThan(0);
    expect(result.scenarioA_totalInterestPaid).toBeGreaterThan(0);
    // Scenario B: used HYS to pay loan, so less interest earned initially
    expect(result.scenarioB_totalInterestEarned).toBeLessThan(result.scenarioA_totalInterestEarned);
    expect(result.scenarioB_totalInterestPaid).toBeLessThan(result.scenarioA_totalInterestPaid);
  });
});

describe("calculateFourOhOneK", () => {
  it("calculates basic match correctly", () => {
    const result = calculateFourOhOneK({
      annualSalary: 100000,
      currentContributionPct: 3,
      employerMatchPct: 50,
      employerMatchCapPct: 6,
      expectedAnnualReturnPct: 7,
      currentBalance: 50000,
    });

    expect(result.currentAnnualContribution).toBe(3000);
    // 50% match on $3000 = $1500
    expect(result.currentEmployerMatch).toBe(1500);
    expect(result.optimalContributionPct).toBe(6);
    expect(result.optimalAnnualContribution).toBe(6000);
    // 50% match on $6000 = $3000
    expect(result.optimalEmployerMatch).toBe(3000);
    expect(result.moneyLeftOnTable).toBe(1500);
  });

  it("returns zero money left on table when at optimal", () => {
    const result = calculateFourOhOneK({
      annualSalary: 100000,
      currentContributionPct: 6,
      employerMatchPct: 50,
      employerMatchCapPct: 6,
      expectedAnnualReturnPct: 7,
      currentBalance: 0,
    });

    expect(result.moneyLeftOnTable).toBe(0);
    expect(result.currentEmployerMatch).toBe(result.optimalEmployerMatch);
  });

  it("handles contribution above match cap", () => {
    const result = calculateFourOhOneK({
      annualSalary: 100000,
      currentContributionPct: 10,
      employerMatchPct: 100,
      employerMatchCapPct: 4,
      expectedAnnualReturnPct: 7,
      currentBalance: 0,
    });

    // Match capped at 4% of salary = $4000
    expect(result.currentEmployerMatch).toBe(4000);
    expect(result.optimalEmployerMatch).toBe(4000);
    expect(result.moneyLeftOnTable).toBe(0);
  });

  it("handles zero salary", () => {
    const result = calculateFourOhOneK({
      annualSalary: 0,
      currentContributionPct: 6,
      employerMatchPct: 50,
      employerMatchCapPct: 6,
      expectedAnnualReturnPct: 7,
      currentBalance: 10000,
    });

    expect(result.currentAnnualContribution).toBe(0);
    expect(result.currentEmployerMatch).toBe(0);
    expect(result.moneyLeftOnTable).toBe(0);
  });

  it("projects 30 years correctly", () => {
    const result = calculateFourOhOneK({
      annualSalary: 100000,
      currentContributionPct: 6,
      employerMatchPct: 50,
      employerMatchCapPct: 6,
      expectedAnnualReturnPct: 7,
      currentBalance: 50000,
    });

    expect(result.projection).toHaveLength(31); // year 0 through 30
    expect(result.projection[0].year).toBe(0);
    expect(result.projection[0].currentBalance).toBe(50000);
    expect(result.projection[30].year).toBe(30);
    // With 7% return and contributions, balance should grow significantly
    expect(result.projection[30].currentBalance).toBeGreaterThan(500000);
    // Max contribution projection should always be >= optimal >= current
    for (const point of result.projection) {
      expect(point.maxBalance).toBeGreaterThanOrEqual(point.optimalBalance - 0.01);
      expect(point.optimalBalance).toBeGreaterThanOrEqual(point.currentBalance - 0.01);
    }
  });

  it("caps contributions at IRS limit", () => {
    const result = calculateFourOhOneK({
      annualSalary: 500000,
      currentContributionPct: 50,
      employerMatchPct: 100,
      employerMatchCapPct: 6,
      expectedAnnualReturnPct: 7,
      currentBalance: 0,
    });

    // 50% of $500k = $250k, but capped at IRS limit $23,500
    expect(result.currentAnnualContribution).toBe(23500);
  });
});
