import { PDFParse } from "pdf-parse";
import Anthropic from "@anthropic-ai/sdk";
import type {
  LoanProfileData,
  LoanStaticData,
  InvestmentProfileData,
  SavingsProfileData,
  CreditProfileData,
} from "@derekentringer/shared";
import { AccountType } from "@derekentringer/shared";

export interface ExtractedStatementData {
  balance: number;
  date: string;
  balanceText: string;
  dateText: string;
  loanProfile?: LoanProfileData;
  loanStatic?: LoanStaticData;
  investmentProfile?: InvestmentProfileData;
  savingsProfile?: SavingsProfileData;
  creditProfile?: CreditProfileData;
  rawProfileExtraction?: Record<string, string>;
}

const PDF_MAGIC_BYTES = Buffer.from("%PDF-");

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // Validate PDF magic bytes regardless of declared MIME type
  if (buffer.length < 5 || !buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES)) {
    throw new Error("File does not appear to be a valid PDF");
  }

  // #5: try/finally ensures pdf.destroy() is always called
  const pdf = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await pdf.getText();
    const text = result.text?.trim();
    if (!text) {
      throw new Error(
        "No text could be extracted from the PDF. This may be a scanned document — only text-based PDFs are supported.",
      );
    }
    return text;
  } finally {
    await pdf.destroy();
  }
}

// #7: Head+tail truncation to catch balances at both start and end of document
function truncateForExtraction(text: string, maxChars: number = 20_000): string {
  if (text.length <= maxChars) return text;

  const half = Math.floor(maxChars / 2);
  const head = text.slice(0, half);
  const tail = text.slice(-half);
  return `${head}\n\n[... middle of document omitted ...]\n\n${tail}`;
}

// --- Tool schema builders per account type ---

interface ToolProperty {
  type: string;
  description: string;
}

interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, ToolProperty>;
    required: string[];
  };
}

function baseProperties(): Record<string, ToolProperty> {
  return {
    balance: {
      type: "number",
      description: "The ending/total/summary balance as a number (no currency symbols)",
    },
    date: {
      type: "string",
      description: "The statement date in YYYY-MM-DD format",
    },
    balanceText: {
      type: "string",
      description: "The exact text from the document that contains the balance",
    },
    dateText: {
      type: "string",
      description: "The exact text from the document that contains the date",
    },
  };
}

function loanProperties(): Record<string, ToolProperty> {
  return {
    periodStart: { type: "string", description: "Statement period start date in YYYY-MM-DD format" },
    periodEnd: { type: "string", description: "Statement period end date in YYYY-MM-DD format" },
    interestRate: { type: "number", description: "Current annual interest rate as a percentage (e.g. 6.5 for 6.5%)" },
    monthlyPayment: { type: "number", description: "Monthly payment amount" },
    principalPaid: { type: "number", description: "Principal paid this period" },
    interestPaid: { type: "number", description: "Interest paid this period" },
    escrowAmount: { type: "number", description: "Escrow amount this period" },
    nextPaymentDate: { type: "string", description: "Next payment due date in YYYY-MM-DD format" },
    remainingTermMonths: { type: "number", description: "Number of months remaining on the loan" },
    // Static loan fields
    originalBalance: { type: "number", description: "Original loan amount" },
    originationDate: { type: "string", description: "Loan origination/start date in YYYY-MM-DD format" },
    maturityDate: { type: "string", description: "Loan maturity/payoff date in YYYY-MM-DD format" },
    loanType: { type: "string", description: "Loan type: 'fixed', 'variable', 'fixed-mortgage', or 'variable-mortgage'" },
    // Raw text fields
    interestRateText: { type: "string", description: "Exact text containing the interest rate" },
    paymentText: { type: "string", description: "Exact text containing the payment breakdown" },
  };
}

function investmentProperties(): Record<string, ToolProperty> {
  return {
    periodStart: { type: "string", description: "Statement period start date in YYYY-MM-DD format" },
    periodEnd: { type: "string", description: "Statement period end date in YYYY-MM-DD format" },
    rateOfReturn: { type: "number", description: "Period rate of return as a percentage" },
    ytdReturn: { type: "number", description: "Year-to-date return as a percentage" },
    totalGainLoss: { type: "number", description: "Total gain/loss amount for this period" },
    contributions: { type: "number", description: "Contributions made this period" },
    employerMatch: { type: "number", description: "Employer match contributions this period" },
    vestingPct: { type: "number", description: "Vesting percentage (e.g. 100 for fully vested)" },
    fees: { type: "number", description: "Fees/expenses charged this period" },
    expenseRatio: { type: "number", description: "Expense ratio as a percentage" },
    dividends: { type: "number", description: "Dividends received this period" },
    capitalGains: { type: "number", description: "Capital gains distributions this period" },
    numHoldings: { type: "number", description: "Number of distinct holdings/positions" },
    // Raw text fields
    returnText: { type: "string", description: "Exact text containing rate of return information" },
    contributionText: { type: "string", description: "Exact text containing contribution details" },
  };
}

function savingsProperties(): Record<string, ToolProperty> {
  return {
    periodStart: { type: "string", description: "Statement period start date in YYYY-MM-DD format" },
    periodEnd: { type: "string", description: "Statement period end date in YYYY-MM-DD format" },
    apy: { type: "number", description: "Annual percentage yield as a percentage (e.g. 4.25 for 4.25%)" },
    interestEarned: { type: "number", description: "Interest earned this period" },
    interestEarnedYtd: { type: "number", description: "Interest earned year-to-date" },
    // Raw text fields
    apyText: { type: "string", description: "Exact text containing the APY" },
    interestText: { type: "string", description: "Exact text containing interest earned details" },
  };
}

function creditProperties(): Record<string, ToolProperty> {
  return {
    periodStart: { type: "string", description: "Statement period start date in YYYY-MM-DD format" },
    periodEnd: { type: "string", description: "Statement period end date in YYYY-MM-DD format" },
    apr: { type: "number", description: "Current annual percentage rate as a percentage (e.g. 24.99 for 24.99%)" },
    minimumPayment: { type: "number", description: "Minimum payment due amount" },
    creditLimit: { type: "number", description: "Total credit limit" },
    availableCredit: { type: "number", description: "Available credit remaining" },
    interestCharged: { type: "number", description: "Interest charged this period" },
    feesCharged: { type: "number", description: "Fees charged this period" },
    rewardsEarned: { type: "number", description: "Rewards or cashback earned this period" },
    paymentDueDate: { type: "string", description: "Next payment due date in YYYY-MM-DD format" },
    // Raw text fields
    aprText: { type: "string", description: "Exact text containing the APR" },
    paymentText: { type: "string", description: "Exact text containing the minimum payment details" },
  };
}

function buildExtractionTool(accountType: AccountType): ToolSchema {
  const props = baseProperties();
  const baseRequired = ["balance", "date", "balanceText", "dateText"];

  if (accountType === AccountType.Loan || accountType === AccountType.RealEstate) {
    Object.assign(props, loanProperties());
  } else if (accountType === AccountType.Investment) {
    Object.assign(props, investmentProperties());
  } else if (accountType === AccountType.HighYieldSavings || accountType === AccountType.Savings) {
    Object.assign(props, savingsProperties());
  } else if (accountType === AccountType.Credit) {
    Object.assign(props, creditProperties());
  }

  return {
    name: "extract_statement_data",
    description: "Record the extracted data from a financial statement",
    input_schema: {
      type: "object" as const,
      properties: props,
      required: baseRequired,
    },
  };
}

function getSystemPrompt(accountType: AccountType): string {
  const base = "You extract structured data from financial statements.";

  if (accountType === AccountType.Loan || accountType === AccountType.RealEstate) {
    return `${base} This is a loan/mortgage statement. Extract the ending balance, statement date, and all available loan details including interest rate, payment breakdown (principal, interest, escrow), remaining term, and any static loan information (original balance, origination date, maturity date, loan type). If there are multiple balances, use the principal/remaining balance. For dates, use YYYY-MM-DD format. Only include fields you can confidently extract from the document.`;
  }

  if (accountType === AccountType.Investment) {
    return `${base} This is an investment/retirement account statement. Extract the ending balance, statement date, and all available investment details including rate of return, contributions, employer match, vesting, fees, dividends, capital gains, and number of holdings. For dates, use YYYY-MM-DD format. Only include fields you can confidently extract from the document.`;
  }

  if (accountType === AccountType.HighYieldSavings || accountType === AccountType.Savings) {
    return `${base} This is a savings account statement. Extract the ending balance, statement date, and all available savings details including APY, interest earned this period, and year-to-date interest. For dates, use YYYY-MM-DD format. Only include fields you can confidently extract from the document.`;
  }

  if (accountType === AccountType.Credit) {
    return `${base} This is a credit card statement. Extract the ending balance (amount owed), statement date, and all available credit card details including APR, minimum payment, credit limit, available credit, interest charged, fees, rewards earned, and payment due date. Balances owed should be positive numbers. For dates, use YYYY-MM-DD format. Only include fields you can confidently extract from the document.`;
  }

  return `${base} Extract the summary/ending balance and statement date. If there are multiple balances, use the total/ending/summary balance, not individual line items. For credit accounts, balances owed should be positive numbers.`;
}

function getTruncationLimit(accountType: AccountType): number {
  // Investment/401k statements tend to be longer with holdings tables
  if (accountType === AccountType.Investment) return 30_000;
  return 20_000;
}

export async function extractBalanceFromText(
  text: string,
  apiKey: string,
  accountName: string,
  accountType: AccountType = AccountType.Other,
): Promise<ExtractedStatementData> {
  const maxChars = getTruncationLimit(accountType);
  const truncated = truncateForExtraction(text, maxChars);

  const client = new Anthropic({ apiKey });
  const tool = buildExtractionTool(accountType);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: getSystemPrompt(accountType),
    tools: [tool],
    tool_choice: { type: "tool", name: "extract_statement_data" },
    messages: [
      {
        role: "user",
        content: `Extract the data from this financial statement for the account "${accountName}".\n\nDocument text:\n${truncated}`,
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI extraction did not return structured data");
  }

  const input = toolUse.input as Record<string, unknown>;

  if (
    typeof input.balance !== "number" ||
    typeof input.date !== "string" ||
    typeof input.balanceText !== "string" ||
    typeof input.dateText !== "string"
  ) {
    throw new Error("AI extraction returned incomplete data");
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("AI extraction returned an invalid date format");
  }

  const result: ExtractedStatementData = {
    balance: input.balance,
    date: input.date,
    balanceText: input.balanceText,
    dateText: input.dateText,
  };

  // Parse account-type-specific fields
  if (accountType === AccountType.Loan || accountType === AccountType.RealEstate) {
    result.loanProfile = parseLoanProfile(input);
    result.loanStatic = parseLoanStatic(input);
    result.rawProfileExtraction = pickRawText(input, ["interestRateText", "paymentText"]);
  } else if (accountType === AccountType.Investment) {
    result.investmentProfile = parseInvestmentProfile(input);
    result.rawProfileExtraction = pickRawText(input, ["returnText", "contributionText"]);
  } else if (accountType === AccountType.HighYieldSavings || accountType === AccountType.Savings) {
    result.savingsProfile = parseSavingsProfile(input);
    result.rawProfileExtraction = pickRawText(input, ["apyText", "interestText"]);
  } else if (accountType === AccountType.Credit) {
    result.creditProfile = parseCreditProfile(input);
    result.rawProfileExtraction = pickRawText(input, ["aprText", "paymentText"]);
  }

  return result;
}

// --- Profile parsers (graceful: skip fields that aren't present/valid) ---

function optNum(val: unknown): number | undefined {
  return typeof val === "number" && Number.isFinite(val) ? val : undefined;
}

function optStr(val: unknown): string | undefined {
  return typeof val === "string" && val.length > 0 ? val : undefined;
}

function optDate(val: unknown): string | undefined {
  const s = optStr(val);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function parseLoanProfile(input: Record<string, unknown>): LoanProfileData {
  return {
    periodStart: optDate(input.periodStart),
    periodEnd: optDate(input.periodEnd),
    interestRate: optNum(input.interestRate),
    monthlyPayment: optNum(input.monthlyPayment),
    principalPaid: optNum(input.principalPaid),
    interestPaid: optNum(input.interestPaid),
    escrowAmount: optNum(input.escrowAmount),
    nextPaymentDate: optDate(input.nextPaymentDate),
    remainingTermMonths: optNum(input.remainingTermMonths),
  };
}

const VALID_LOAN_TYPES = new Set(["fixed", "variable", "fixed-mortgage", "variable-mortgage"]);

function parseLoanStatic(input: Record<string, unknown>): LoanStaticData {
  const rawLoanType = optStr(input.loanType);
  return {
    originalBalance: optNum(input.originalBalance),
    originationDate: optDate(input.originationDate),
    maturityDate: optDate(input.maturityDate),
    loanType: rawLoanType && VALID_LOAN_TYPES.has(rawLoanType)
      ? (rawLoanType as LoanStaticData["loanType"])
      : undefined,
  };
}

function parseInvestmentProfile(input: Record<string, unknown>): InvestmentProfileData {
  return {
    periodStart: optDate(input.periodStart),
    periodEnd: optDate(input.periodEnd),
    rateOfReturn: optNum(input.rateOfReturn),
    ytdReturn: optNum(input.ytdReturn),
    totalGainLoss: optNum(input.totalGainLoss),
    contributions: optNum(input.contributions),
    employerMatch: optNum(input.employerMatch),
    vestingPct: optNum(input.vestingPct),
    fees: optNum(input.fees),
    expenseRatio: optNum(input.expenseRatio),
    dividends: optNum(input.dividends),
    capitalGains: optNum(input.capitalGains),
    numHoldings: optNum(input.numHoldings),
  };
}

function parseSavingsProfile(input: Record<string, unknown>): SavingsProfileData {
  return {
    periodStart: optDate(input.periodStart),
    periodEnd: optDate(input.periodEnd),
    apy: optNum(input.apy),
    interestEarned: optNum(input.interestEarned),
    interestEarnedYtd: optNum(input.interestEarnedYtd),
  };
}

function parseCreditProfile(input: Record<string, unknown>): CreditProfileData {
  return {
    periodStart: optDate(input.periodStart),
    periodEnd: optDate(input.periodEnd),
    apr: optNum(input.apr),
    minimumPayment: optNum(input.minimumPayment),
    creditLimit: optNum(input.creditLimit),
    availableCredit: optNum(input.availableCredit),
    interestCharged: optNum(input.interestCharged),
    feesCharged: optNum(input.feesCharged),
    rewardsEarned: optNum(input.rewardsEarned),
    paymentDueDate: optDate(input.paymentDueDate),
  };
}

function pickRawText(input: Record<string, unknown>, keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const val = optStr(input[key]);
    if (val) result[key] = val;
  }
  return Object.keys(result).length > 0 ? result : {};
}
