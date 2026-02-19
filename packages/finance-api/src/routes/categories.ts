import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../store/categoryStore.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;

const createCategorySchema = {
  body: {
    type: "object" as const,
    required: ["name"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
    },
  },
};

const updateCategorySchema = {
  body: {
    type: "object" as const,
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      sortOrder: { type: "number" },
    },
  },
};

export default async function categoryRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  fastify.get(
    "/",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const categories = await listCategories();
        return reply.send({ categories });
      } catch (e) {
        _request.log.error(e, "Failed to list categories");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list categories",
        });
      }
    },
  );

  fastify.post<{ Body: { name: string } }>(
    "/",
    { schema: createCategorySchema },
    async (
      request: FastifyRequest<{ Body: { name: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const category = await createCategory(request.body);
        return reply.status(201).send({ category });
      } catch (e) {
        if (e instanceof Error && e.message.includes("Unique constraint")) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: "Category name already exists",
          });
        }
        request.log.error(e, "Failed to create category");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to create category",
        });
      }
    },
  );

  fastify.patch<{
    Params: { id: string };
    Body: { name?: string; sortOrder?: number };
  }>(
    "/:id",
    { schema: updateCategorySchema },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { name?: string; sortOrder?: number };
      }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid category ID format",
        });
      }

      try {
        const category = await updateCategory(
          request.params.id,
          request.body,
        );
        if (!category) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Category not found",
          });
        }
        return reply.send({ category });
      } catch (e) {
        request.log.error(e, "Failed to update category");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to update category",
        });
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid category ID format",
        });
      }

      try {
        const deleted = await deleteCategory(request.params.id);
        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Category not found",
          });
        }
        return reply.status(204).send();
      } catch (e) {
        if (e instanceof Error && e.message === "Cannot delete default category") {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "Cannot delete default category",
          });
        }
        request.log.error(e, "Failed to delete category");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to delete category",
        });
      }
    },
  );
}
