import type {
  HysVsDebtInputs,
  HysVsDebtResult,
  HysVsDebtMonthPoint,
  FourOhOneKInputs,
  FourOhOneKResult,
  FourOhOneKYearPoint,
} from "@derekentringer/shared/finance";

const IRS_401K_LIMIT = 23500;

function monthLabel(monthOffset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function calculateHysVsDebt(inputs: HysVsDebtInputs): HysVsDebtResult {
  const { hysBalance, hysApy, loanBalance, loanApr, monthlyPayment } = inputs;

  const monthlyHysRate = hysApy / 100 / 12;
  const monthlyLoanRate = loanApr / 100 / 12;

  // Scenario A: keep HYS, pay minimum on loan
  let aHys = hysBalance;
  let aLoan = loanBalance;
  let aTotalInterestEarned = 0;
  let aTotalInterestPaid = 0;

  // Scenario B: use HYS to pay down loan, then rebuild
  let bLoan = Math.max(0, loanBalance - hysBalance);
  let bHys = Math.max(0, hysBalance - loanBalance);
  let bTotalInterestEarned = 0;
  let bTotalInterestPaid = 0;

  const schedule: HysVsDebtMonthPoint[] = [];
  let breakEvenMonth: number | null = null;

  // Month 0 — starting position
  schedule.push({
    month: 0,
    label: monthLabel(0),
    scenarioA_hysBalance: aHys,
    scenarioA_loanBalance: aLoan,
    scenarioA_netPosition: aHys - aLoan,
    scenarioB_hysBalance: bHys,
    scenarioB_loanBalance: bLoan,
    scenarioB_netPosition: bHys - bLoan,
  });

  for (let m = 1; m <= 360; m++) {
    // --- Scenario A ---
    const aHysInterest = aHys * monthlyHysRate;
    aHys += aHysInterest;
    aTotalInterestEarned += aHysInterest;

    if (aLoan > 0) {
      const aLoanInterest = aLoan * monthlyLoanRate;
      aTotalInterestPaid += aLoanInterest;
      aLoan += aLoanInterest;
      const aPayment = Math.min(monthlyPayment, aLoan);
      aLoan -= aPayment;
      if (aLoan < 0.01) aLoan = 0;
    } else {
      // Loan paid off — redirect payment to HYS
      aHys += monthlyPayment;
    }

    // --- Scenario B ---
    const bHysInterest = bHys * monthlyHysRate;
    bHys += bHysInterest;
    bTotalInterestEarned += bHysInterest;

    if (bLoan > 0) {
      const bLoanInterest = bLoan * monthlyLoanRate;
      bTotalInterestPaid += bLoanInterest;
      bLoan += bLoanInterest;
      const bPayment = Math.min(monthlyPayment, bLoan);
      bLoan -= bPayment;
      if (bLoan < 0.01) bLoan = 0;
    } else {
      bHys += monthlyPayment;
    }

    const aNet = aHys - aLoan;
    const bNet = bHys - bLoan;

    schedule.push({
      month: m,
      label: monthLabel(m),
      scenarioA_hysBalance: aHys,
      scenarioA_loanBalance: aLoan,
      scenarioA_netPosition: aNet,
      scenarioB_hysBalance: bHys,
      scenarioB_loanBalance: bLoan,
      scenarioB_netPosition: bNet,
    });

    if (breakEvenMonth === null && bNet > aNet + 0.01) {
      breakEvenMonth = m;
    }

    // Stop early if both loans are paid off and we have 12 months of post-payoff data
    if (aLoan === 0 && bLoan === 0 && m >= 12) {
      break;
    }
  }

  const lastA = schedule[schedule.length - 1].scenarioA_netPosition;
  const lastB = schedule[schedule.length - 1].scenarioB_netPosition;
  const netBenefit = lastB - lastA;

  return {
    schedule,
    scenarioA_totalInterestEarned: aTotalInterestEarned,
    scenarioA_totalInterestPaid: aTotalInterestPaid,
    scenarioB_totalInterestEarned: bTotalInterestEarned,
    scenarioB_totalInterestPaid: bTotalInterestPaid,
    netBenefit,
    breakEvenMonth,
    recommendation: netBenefit > 0 ? "pay-loan" : "keep-hys",
  };
}

function computeEmployerMatch(
  annualContribution: number,
  salary: number,
  matchPct: number,
  matchCapPct: number,
): number {
  const matchableContribution = Math.min(annualContribution, salary * matchCapPct / 100);
  return matchableContribution * matchPct / 100;
}

export function calculateFourOhOneK(inputs: FourOhOneKInputs): FourOhOneKResult {
  const {
    annualSalary,
    currentContributionPct,
    employerMatchPct,
    employerMatchCapPct,
    expectedAnnualReturnPct,
    currentBalance,
  } = inputs;

  const returnRate = expectedAnnualReturnPct / 100;

  // Current level
  const currentAnnualContribution = Math.min(annualSalary * currentContributionPct / 100, IRS_401K_LIMIT);
  const currentEmployerMatch = computeEmployerMatch(currentAnnualContribution, annualSalary, employerMatchPct, employerMatchCapPct);

  // Optimal = contribute at least to match cap
  const optimalContributionPct = employerMatchCapPct;
  const optimalAnnualContribution = Math.min(annualSalary * optimalContributionPct / 100, IRS_401K_LIMIT);
  const optimalEmployerMatch = computeEmployerMatch(optimalAnnualContribution, annualSalary, employerMatchPct, employerMatchCapPct);

  const moneyLeftOnTable = optimalEmployerMatch - currentEmployerMatch;

  // IRS max
  const maxAnnualContribution = IRS_401K_LIMIT;
  const maxEmployerMatch = computeEmployerMatch(maxAnnualContribution, annualSalary, employerMatchPct, employerMatchCapPct);

  // Project 30 years
  const projection: FourOhOneKYearPoint[] = [];
  let currentBal = currentBalance;
  let optimalBal = currentBalance;
  let maxBal = currentBalance;

  projection.push({
    year: 0,
    label: "Now",
    currentBalance: currentBal,
    optimalBalance: optimalBal,
    maxBalance: maxBal,
  });

  for (let y = 1; y <= 30; y++) {
    currentBal = (currentBal + currentAnnualContribution + currentEmployerMatch) * (1 + returnRate);
    optimalBal = (optimalBal + optimalAnnualContribution + optimalEmployerMatch) * (1 + returnRate);
    maxBal = (maxBal + maxAnnualContribution + maxEmployerMatch) * (1 + returnRate);

    projection.push({
      year: y,
      label: `Year ${y}`,
      currentBalance: currentBal,
      optimalBalance: optimalBal,
      maxBalance: maxBal,
    });
  }

  return {
    currentAnnualContribution,
    currentEmployerMatch,
    optimalContributionPct,
    optimalAnnualContribution,
    optimalEmployerMatch,
    moneyLeftOnTable,
    projection,
  };
}
