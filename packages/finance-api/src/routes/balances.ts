import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { PdfImportConfirmRequest } from "@derekentringer/shared";
import { AccountType } from "@derekentringer/shared";
import { requirePin } from "@derekentringer/shared/auth/pinVerify";
import { loadConfig } from "../config.js";
import { getAccount } from "../store/accountStore.js";
import { listBalances, findBalanceByDate } from "../store/balanceStore.js";
import { getPrisma } from "../lib/prisma.js";
import {
  encryptBalanceForCreate,
  encryptLoanProfileForCreate,
  encryptInvestmentProfileForCreate,
  encryptSavingsProfileForCreate,
  encryptLoanStaticForUpdate,
  encryptCreditProfileForCreate,
} from "../lib/mappers.js";
import { encryptNumber } from "../lib/encryption.js";
import { extractTextFromPdf, extractBalanceFromText } from "../lib/pdfExtract.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;

// #8: Known error messages that are safe to surface to clients
const OVERLOADED_MESSAGE =
  "The AI service is currently overloaded. Please try again in a few minutes.";

const KNOWN_EXTRACTION_ERRORS = new Set([
  "File does not appear to be a valid PDF",
  "No text could be extracted from the PDF. This may be a scanned document — only text-based PDFs are supported.",
  "AI extraction did not return structured data",
  "AI extraction returned incomplete data",
  "AI extraction returned an invalid date format",
  "PDF import is not configured",
]);

const confirmSchema = {
  body: {
    type: "object" as const,
    required: ["accountId", "balance", "date", "updateCurrentBalance"],
    additionalProperties: false,
    properties: {
      accountId: { type: "string" },
      balance: { type: "number" },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      updateCurrentBalance: { type: "boolean" },
      updateInterestRate: { type: "boolean" },
      loanProfile: {
        type: "object",
        additionalProperties: false,
        properties: {
          periodStart: { type: "string" },
          periodEnd: { type: "string" },
          interestRate: { type: "number" },
          monthlyPayment: { type: "number" },
          principalPaid: { type: "number" },
          interestPaid: { type: "number" },
          escrowAmount: { type: "number" },
          nextPaymentDate: { type: "string" },
          remainingTermMonths: { type: "number" },
        },
      },
      loanStatic: {
        type: "object",
        additionalProperties: false,
        properties: {
          originalBalance: { type: "number" },
          originationDate: { type: "string" },
          maturityDate: { type: "string" },
          loanType: { type: "string" },
        },
      },
      investmentProfile: {
        type: "object",
        additionalProperties: false,
        properties: {
          periodStart: { type: "string" },
          periodEnd: { type: "string" },
          rateOfReturn: { type: "number" },
          ytdReturn: { type: "number" },
          totalGainLoss: { type: "number" },
          contributions: { type: "number" },
          employerMatch: { type: "number" },
          vestingPct: { type: "number" },
          fees: { type: "number" },
          expenseRatio: { type: "number" },
          dividends: { type: "number" },
          capitalGains: { type: "number" },
          numHoldings: { type: "number" },
        },
      },
      savingsProfile: {
        type: "object",
        additionalProperties: false,
        properties: {
          periodStart: { type: "string" },
          periodEnd: { type: "string" },
          apy: { type: "number" },
          interestEarned: { type: "number" },
          interestEarnedYtd: { type: "number" },
        },
      },
      creditProfile: {
        type: "object",
        additionalProperties: false,
        properties: {
          periodStart: { type: "string" },
          periodEnd: { type: "string" },
          apr: { type: "number" },
          minimumPayment: { type: "number" },
          creditLimit: { type: "number" },
          availableCredit: { type: "number" },
          interestCharged: { type: "number" },
          feesCharged: { type: "number" },
          rewardsEarned: { type: "number" },
          paymentDueDate: { type: "string" },
        },
      },
    },
  },
};

export default async function balanceRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  const config = loadConfig();
  const pinGuard = requirePin(config.pinTokenSecret);

  // #9: Log warning at startup if ANTHROPIC_API_KEY is missing
  if (!config.anthropicApiKey) {
    fastify.log.warn(
      "ANTHROPIC_API_KEY is not set — PDF statement import will be disabled",
    );
  }

  // GET / — list balances for an account
  fastify.get<{ Querystring: { accountId?: string } }>(
    "/",
    async (
      request: FastifyRequest<{ Querystring: { accountId?: string } }>,
      reply: FastifyReply,
    ) => {
      const { accountId } = request.query;

      if (!accountId || !CUID_PATTERN.test(accountId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Valid accountId query parameter is required",
        });
      }

      try {
        const balances = await listBalances(accountId);
        return reply.send({ balances });
      } catch (e) {
        request.log.error(e, "Failed to list balances");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list balances",
        });
      }
    },
  );

  // POST /import/preview — upload PDF, extract balance via AI
  fastify.post<{ Querystring: { accountId: string } }>(
    "/import/preview",
    { preHandler: pinGuard },
    async (
      request: FastifyRequest<{ Querystring: { accountId: string } }>,
      reply: FastifyReply,
    ) => {
      const { accountId } = request.query;

      if (!accountId || !CUID_PATTERN.test(accountId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Valid accountId query parameter is required",
        });
      }

      if (!config.anthropicApiKey) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "PDF import is not configured",
        });
      }

      try {
        const account = await getAccount(accountId);
        if (!account) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Account not found",
          });
        }

        const file = await request.file();
        if (!file) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "No file uploaded",
          });
        }

        if (file.mimetype !== "application/pdf") {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "File must be a PDF",
          });
        }

        const buffer = await file.toBuffer();
        const text = await extractTextFromPdf(buffer);
        const extraction = await extractBalanceFromText(
          text,
          config.anthropicApiKey,
          account.name,
          account.type,
        );

        // #4: Check for existing balance on the same date
        const existingOnDate = await findBalanceByDate(
          accountId,
          new Date(extraction.date),
        );

        return reply.send({
          accountId: account.id,
          accountName: account.name,
          accountType: account.type,
          balance: extraction.balance,
          date: extraction.date,
          rawExtraction: {
            balanceText: extraction.balanceText,
            dateText: extraction.dateText,
          },
          existingBalance: account.currentBalance,
          existingBalanceOnDate: existingOnDate
            ? existingOnDate.balance
            : null,
          loanProfile: extraction.loanProfile,
          loanStatic: extraction.loanStatic,
          investmentProfile: extraction.investmentProfile,
          savingsProfile: extraction.savingsProfile,
          creditProfile: extraction.creditProfile,
          rawProfileExtraction: extraction.rawProfileExtraction,
        });
      } catch (e) {
        request.log.error(e, "Failed to preview PDF import");
        // Surface overloaded errors so the user knows to retry
        if (e instanceof Error && "status" in e && (e as Record<string, unknown>).status === 529) {
          return reply.status(503).send({
            statusCode: 503,
            error: "Service Unavailable",
            message: OVERLOADED_MESSAGE,
          });
        }
        // Surface billing/auth errors from the AI provider
        if (e instanceof Error && "status" in e) {
          const status = (e as Record<string, unknown>).status;
          if (status === 400 || status === 401 || status === 403) {
            const body = (e as Record<string, unknown> & { error?: { error?: { message?: string } } }).error?.error?.message ?? e.message;
            if (typeof body === "string" && (body.includes("credit balance") || body.includes("billing") || body.includes("API key"))) {
              return reply.status(502).send({
                statusCode: 502,
                error: "Bad Gateway",
                message: body,
              });
            }
          }
        }
        // #8: Only surface known, safe error messages to clients
        const message =
          e instanceof Error && KNOWN_EXTRACTION_ERRORS.has(e.message)
            ? e.message
            : "Failed to preview PDF import";
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message,
        });
      }
    },
  );

  // POST /import/confirm — save balance record + profile data atomically
  fastify.post<{ Body: PdfImportConfirmRequest }>(
    "/import/confirm",
    { schema: confirmSchema, preHandler: pinGuard },
    async (
      request: FastifyRequest<{ Body: PdfImportConfirmRequest }>,
      reply: FastifyReply,
    ) => {
      const {
        accountId,
        balance,
        date,
        updateCurrentBalance,
        updateInterestRate,
        loanProfile,
        loanStatic,
        investmentProfile,
        savingsProfile,
        creditProfile,
      } = request.body;

      if (!CUID_PATTERN.test(accountId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid accountId format",
        });
      }

      try {
        const account = await getAccount(accountId);
        if (!account) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Account not found",
          });
        }

        // Validate profile type matches account type
        const at = account.type;
        if (loanProfile && at !== AccountType.Loan && at !== AccountType.RealEstate) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "loanProfile is only valid for loan and real estate accounts",
          });
        }
        if (loanStatic && at !== AccountType.Loan && at !== AccountType.RealEstate) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "loanStatic is only valid for loan and real estate accounts",
          });
        }
        if (investmentProfile && at !== AccountType.Investment) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "investmentProfile is only valid for investment accounts",
          });
        }
        if (
          savingsProfile &&
          at !== AccountType.HighYieldSavings &&
          at !== AccountType.Savings
        ) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "savingsProfile is only valid for savings accounts",
          });
        }
        if (creditProfile && at !== AccountType.Credit) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "creditProfile is only valid for credit accounts",
          });
        }

        const prisma = getPrisma();

        let accountUpdated = false;
        let interestRateUpdated = false;
        let replaced = false;

        await prisma.$transaction(async (tx) => {
          // 1. Check for existing balance on the same account+date
          const balanceDate = new Date(date);
          const startOfDay = new Date(balanceDate);
          startOfDay.setUTCHours(0, 0, 0, 0);
          const endOfDay = new Date(balanceDate);
          endOfDay.setUTCHours(23, 59, 59, 999);

          const existing = await tx.balance.findFirst({
            where: {
              accountId,
              date: { gte: startOfDay, lte: endOfDay },
            },
          });

          if (existing) {
            // Delete old balance — profiles cascade-delete
            await tx.balance.delete({ where: { id: existing.id } });
            replaced = true;
          }

          // 2. Create Balance record
          const encrypted = encryptBalanceForCreate({
            accountId,
            balance,
            date: balanceDate,
          });
          const balanceRow = await tx.balance.create({ data: encrypted });

          // 2. Create profile record if data has at least one non-null field
          if (loanProfile && hasData(loanProfile)) {
            await tx.loanProfile.create({
              data: encryptLoanProfileForCreate(balanceRow.id, loanProfile),
            });
          }
          if (investmentProfile && hasData(investmentProfile)) {
            await tx.investmentProfile.create({
              data: encryptInvestmentProfileForCreate(balanceRow.id, investmentProfile),
            });
          }
          if (savingsProfile && hasData(savingsProfile)) {
            await tx.savingsProfile.create({
              data: encryptSavingsProfileForCreate(balanceRow.id, savingsProfile),
            });
          }
          if (creditProfile && hasData(creditProfile)) {
            await tx.creditProfile.create({
              data: encryptCreditProfileForCreate(balanceRow.id, creditProfile),
            });
          }

          // 3. Update Account.currentBalance
          if (updateCurrentBalance && balance !== account.currentBalance) {
            await tx.account.update({
              where: { id: accountId },
              data: { currentBalance: encryptNumber(balance) },
            });
            accountUpdated = true;
          }

          // 4. Update Account.interestRate from loan or savings profile
          if (updateInterestRate) {
            const newRate = loanProfile?.interestRate ?? savingsProfile?.apy;
            if (newRate != null) {
              await tx.account.update({
                where: { id: accountId },
                data: { interestRate: encryptNumber(newRate) },
              });
              interestRateUpdated = true;
            }
          }

          // 5. Update Account static loan fields
          if (loanStatic && hasData(loanStatic)) {
            const encryptedStatic = encryptLoanStaticForUpdate(loanStatic);
            if (Object.keys(encryptedStatic).length > 0) {
              await tx.account.update({
                where: { id: accountId },
                data: encryptedStatic,
              });
            }
          }

          // 6. Update Account.employerName from investment profile
          if (investmentProfile?.employerMatch != null && investmentProfile.employerMatch > 0) {
            // Only update if employer match is present — employer name comes from account, not statement
          }
        });

        return reply.send({
          balance,
          date,
          accountUpdated,
          interestRateUpdated: interestRateUpdated || undefined,
          replaced: replaced || undefined,
        });
      } catch (e) {
        request.log.error(e, "Failed to confirm PDF import");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to confirm PDF import",
        });
      }
    },
  );
}

/** Check if a profile data object has at least one non-null/undefined value */
function hasData(obj: object): boolean {
  return Object.values(obj).some((v) => v != null);
}
