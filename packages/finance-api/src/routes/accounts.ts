import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  AccountType,
  type CreateAccountRequest,
  type UpdateAccountRequest,
} from "@derekentringer/shared";
import {
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
  deleteAccount,
} from "../store/accountStore.js";

const VALID_ACCOUNT_TYPES = Object.values(AccountType) as string[];
const MAX_STRING_LENGTH = 255;

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringTooLong(value: unknown): boolean {
  return typeof value === "string" && value.length > MAX_STRING_LENGTH;
}

const UPDATE_FIELDS = new Set([
  "name",
  "type",
  "institution",
  "currentBalance",
  "accountNumber",
  "interestRate",
  "csvParserId",
  "isActive",
]);

function hasRecognizedFields(body: Record<string, unknown>): boolean {
  return Object.keys(body).some((key) => UPDATE_FIELDS.has(key));
}

export default async function accountRoutes(fastify: FastifyInstance) {
  // All routes require auth
  fastify.addHook("onRequest", fastify.authenticate);

  // GET / — list accounts
  fastify.get<{ Querystring: { active?: string } }>(
    "/",
    async (
      request: FastifyRequest<{ Querystring: { active?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { active } = request.query;
        const filter: { isActive?: boolean } = {};
        if (active === "true") filter.isActive = true;
        if (active === "false") filter.isActive = false;

        const accounts = await listAccounts(filter);
        return reply.send({ accounts });
      } catch (e) {
        request.log.error(e, "Failed to list accounts");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list accounts",
        });
      }
    },
  );

  // GET /:id — get single account
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const account = await getAccount(request.params.id);
        if (!account) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Account not found",
          });
        }
        return reply.send({ account });
      } catch (e) {
        request.log.error(e, "Failed to get account");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to get account",
        });
      }
    },
  );

  // POST / — create account
  fastify.post<{ Body: CreateAccountRequest }>(
    "/",
    async (
      request: FastifyRequest<{ Body: CreateAccountRequest }>,
      reply: FastifyReply,
    ) => {
      const { name, type, institution, currentBalance, interestRate } =
        request.body || {};

      if (!name || !type || !institution || currentBalance === undefined) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message:
            "name, type, institution, and currentBalance are required",
        });
      }

      if (!isValidNumber(currentBalance)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "currentBalance must be a finite number",
        });
      }

      if (interestRate !== undefined && interestRate !== null && !isValidNumber(interestRate)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "interestRate must be a finite number",
        });
      }

      if (!VALID_ACCOUNT_TYPES.includes(type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `Invalid account type. Must be one of: ${VALID_ACCOUNT_TYPES.join(", ")}`,
        });
      }

      if (
        isStringTooLong(name) ||
        isStringTooLong(institution) ||
        isStringTooLong(request.body.accountNumber) ||
        isStringTooLong(request.body.csvParserId)
      ) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `String fields must not exceed ${MAX_STRING_LENGTH} characters`,
        });
      }

      try {
        const account = await createAccount(request.body);
        return reply.status(201).send({ account });
      } catch (e) {
        request.log.error(e, "Failed to create account");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to create account",
        });
      }
    },
  );

  // PATCH /:id — partial update account
  fastify.patch<{ Params: { id: string }; Body: UpdateAccountRequest }>(
    "/:id",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: UpdateAccountRequest;
      }>,
      reply: FastifyReply,
    ) => {
      const body = request.body || {};
      const { type, currentBalance, interestRate } = body;

      if (!hasRecognizedFields(body as Record<string, unknown>)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Request body must contain at least one recognized field",
        });
      }

      if (type !== undefined && !VALID_ACCOUNT_TYPES.includes(type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `Invalid account type. Must be one of: ${VALID_ACCOUNT_TYPES.join(", ")}`,
        });
      }

      if (currentBalance !== undefined && !isValidNumber(currentBalance)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "currentBalance must be a finite number",
        });
      }

      if (interestRate !== undefined && interestRate !== null && !isValidNumber(interestRate)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "interestRate must be a finite number",
        });
      }

      if (
        isStringTooLong(body.name) ||
        isStringTooLong(body.institution) ||
        isStringTooLong(body.accountNumber) ||
        isStringTooLong(body.csvParserId)
      ) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `String fields must not exceed ${MAX_STRING_LENGTH} characters`,
        });
      }

      try {
        const account = await updateAccount(request.params.id, body);
        if (!account) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Account not found",
          });
        }
        return reply.send({ account });
      } catch (e) {
        request.log.error(e, "Failed to update account");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to update account",
        });
      }
    },
  );

  // DELETE /:id — delete account
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const deleted = await deleteAccount(request.params.id);
        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Account not found",
          });
        }
        return reply.status(204).send();
      } catch (e) {
        request.log.error(e, "Failed to delete account");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to delete account",
        });
      }
    },
  );
}
