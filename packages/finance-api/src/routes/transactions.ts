import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  CsvImportConfirmRequest,
  UpdateTransactionRequest,
  BulkUpdateCategoryRequest,
} from "@derekentringer/shared";
import { requirePin } from "@derekentringer/shared/auth/pinVerify";
import { loadConfig } from "../config.js";
import {
  listTransactions,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  findExistingHashes,
  bulkCreateTransactions,
  bulkUpdateCategory,
} from "../store/transactionStore.js";
import { listCategoryRules } from "../store/categoryRuleStore.js";
import { getAccount } from "../store/accountStore.js";
import { getParser } from "../csv-parsers/index.js";
import { generateDedupeHash } from "../lib/dedupeHash.js";
import { categorizeTransaction } from "../lib/categoryEngine.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;

const confirmSchema = {
  body: {
    type: "object" as const,
    required: ["accountId", "transactions"],
    additionalProperties: false,
    properties: {
      accountId: { type: "string" },
      transactions: {
        type: "array" as const,
        items: {
          type: "object" as const,
          required: ["date", "description", "amount", "dedupeHash"],
          additionalProperties: false,
          properties: {
            date: { type: "string" },
            description: { type: "string" },
            amount: { type: "number" },
            category: { type: ["string", "null"] },
            dedupeHash: { type: "string" },
          },
        },
      },
    },
  },
};

export default async function transactionRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  const config = loadConfig();
  const pinGuard = requirePin(config.pinTokenSecret);

  // GET / — list transactions
  fastify.get<{
    Querystring: {
      accountId?: string;
      startDate?: string;
      endDate?: string;
      category?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };
  }>(
    "/",
    async (
      request: FastifyRequest<{
        Querystring: {
          accountId?: string;
          startDate?: string;
          endDate?: string;
          category?: string;
          search?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { accountId, startDate, endDate, category, search, limit, offset } =
          request.query;

        const filter: {
          accountId?: string;
          startDate?: Date;
          endDate?: Date;
          category?: string;
          search?: string;
          limit?: number;
          offset?: number;
        } = {};

        if (accountId) {
          if (!CUID_PATTERN.test(accountId)) {
            return reply.status(400).send({
              statusCode: 400,
              error: "Bad Request",
              message: "Invalid accountId format",
            });
          }
          filter.accountId = accountId;
        }
        if (category) filter.category = category;
        if (search) filter.search = search.slice(0, 200);
        if (startDate) filter.startDate = new Date(startDate.includes("T") ? startDate : startDate + "T00:00:00");
        if (endDate) filter.endDate = new Date(endDate.includes("T") ? endDate : endDate + "T00:00:00");
        if (limit) filter.limit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
        if (offset) filter.offset = Math.max(parseInt(offset, 10) || 0, 0);

        const result = await listTransactions(filter);
        return reply.send(result);
      } catch (e) {
        request.log.error(e, "Failed to list transactions");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list transactions",
        });
      }
    },
  );

  // GET /:id — get single transaction
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid transaction ID format",
        });
      }

      try {
        const transaction = await getTransaction(request.params.id);
        if (!transaction) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Transaction not found",
          });
        }
        return reply.send({ transaction });
      } catch (e) {
        request.log.error(e, "Failed to get transaction");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to get transaction",
        });
      }
    },
  );

  // PATCH /bulk-category — bulk update category for multiple transactions
  const bulkCategorySchema = {
    body: {
      type: "object" as const,
      required: ["ids", "category"],
      additionalProperties: false,
      properties: {
        ids: {
          type: "array" as const,
          minItems: 1,
          maxItems: 500,
          items: { type: "string", pattern: "^c[a-z0-9]{20,}$" },
        },
        category: { type: ["string", "null"] },
      },
    },
  };

  fastify.patch<{ Body: BulkUpdateCategoryRequest }>(
    "/bulk-category",
    { schema: bulkCategorySchema },
    async (
      request: FastifyRequest<{ Body: BulkUpdateCategoryRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const { ids, category } = request.body;
        const updated = await bulkUpdateCategory(ids, category);
        return reply.send({ updated });
      } catch (e) {
        request.log.error(e, "Failed to bulk update category");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to bulk update category",
        });
      }
    },
  );

  // PATCH /:id — update transaction
  const updateTransactionSchema = {
    body: {
      type: "object" as const,
      additionalProperties: false,
      minProperties: 1,
      properties: {
        category: { type: ["string", "null"] },
        notes: { type: ["string", "null"] },
      },
    },
  };

  fastify.patch<{
    Params: { id: string };
    Body: UpdateTransactionRequest;
  }>(
    "/:id",
    { schema: updateTransactionSchema },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: UpdateTransactionRequest;
      }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid transaction ID format",
        });
      }

      try {
        const transaction = await updateTransaction(
          request.params.id,
          request.body,
        );
        if (!transaction) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Transaction not found",
          });
        }
        return reply.send({ transaction });
      } catch (e) {
        request.log.error(e, "Failed to update transaction");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to update transaction",
        });
      }
    },
  );

  // DELETE /:id — delete transaction (PIN required)
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: pinGuard },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid transaction ID format",
        });
      }

      try {
        const deleted = await deleteTransaction(request.params.id);
        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Transaction not found",
          });
        }
        return reply.status(204).send();
      } catch (e) {
        request.log.error(e, "Failed to delete transaction");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to delete transaction",
        });
      }
    },
  );

  // POST /import/preview — upload CSV, parse, dedupe, categorize
  fastify.post<{
    Querystring: { accountId: string; csvParserId?: string };
  }>(
    "/import/preview",
    {
      preHandler: pinGuard,
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (
      request: FastifyRequest<{
        Querystring: { accountId: string; csvParserId?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { accountId, csvParserId: overrideParserId } = request.query;

      if (!accountId || !CUID_PATTERN.test(accountId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Valid accountId query parameter is required",
        });
      }

      try {
        // Look up account to find its parser
        const account = await getAccount(accountId);
        if (!account) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Account not found",
          });
        }

        const parserId = overrideParserId || account.csvParserId;
        if (!parserId) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message:
              "No CSV parser assigned to this account. Set csvParserId on the account or provide it as a query parameter.",
          });
        }

        const parser = getParser(parserId);
        if (!parser) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "Unknown CSV parser ID",
          });
        }

        // Read uploaded file
        const file = await request.file();
        if (!file) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "No file uploaded",
          });
        }

        const buffer = await file.toBuffer();
        const csvContent = buffer.toString("utf-8");

        // Parse CSV
        const rawRows = parser.parse(csvContent);
        if (rawRows.length > 5000) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "CSV file too large (maximum 5000 rows)",
          });
        }
        if (rawRows.length === 0) {
          return reply.send({
            transactions: [],
            totalRows: 0,
            duplicateCount: 0,
            categorizedCount: 0,
          });
        }

        // Generate dedupe hashes
        const hashes = rawRows.map((row) =>
          generateDedupeHash(accountId, row.date, row.description, row.amount),
        );

        // Check for existing hashes
        const existingHashes = await findExistingHashes(accountId, hashes);

        // Load category rules for auto-categorization
        const rules = await listCategoryRules();

        let duplicateCount = 0;
        let categorizedCount = 0;

        const transactions = rawRows.map((row, i) => {
          const isDuplicate = existingHashes.has(hashes[i]);
          if (isDuplicate) duplicateCount++;

          const category = categorizeTransaction(
            { description: row.description, bankCategory: row.bankCategory },
            rules,
          );
          if (category) categorizedCount++;

          return {
            date: row.date.toISOString(),
            description: row.description,
            amount: row.amount,
            category,
            bankCategory: row.bankCategory ?? null,
            dedupeHash: hashes[i],
            isDuplicate,
          };
        });

        return reply.send({
          transactions,
          totalRows: transactions.length,
          duplicateCount,
          categorizedCount,
        });
      } catch (e) {
        request.log.error(e, "Failed to preview CSV import");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to preview CSV import",
        });
      }
    },
  );

  // POST /import/confirm — save confirmed transactions
  fastify.post<{ Body: CsvImportConfirmRequest }>(
    "/import/confirm",
    { schema: confirmSchema, preHandler: pinGuard },
    async (
      request: FastifyRequest<{ Body: CsvImportConfirmRequest }>,
      reply: FastifyReply,
    ) => {
      const { accountId, transactions } = request.body;

      if (!CUID_PATTERN.test(accountId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid accountId format",
        });
      }

      if (transactions.length === 0) {
        return reply.send({ imported: 0, skipped: 0 });
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

        const toInsert = transactions.map((t) => ({
          accountId,
          date: new Date(t.date),
          description: t.description,
          amount: t.amount,
          category: t.category,
          dedupeHash: t.dedupeHash,
        }));

        const imported = await bulkCreateTransactions(toInsert);
        const skipped = transactions.length - imported;

        return reply.send({ imported, skipped });
      } catch (e) {
        request.log.error(e, "Failed to confirm CSV import");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to confirm CSV import",
        });
      }
    },
  );
}
