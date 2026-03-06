import type { FastifyRequest, FastifyReply } from "fastify";

export async function adminGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.user.role !== "admin") {
    return reply.status(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Admin access required",
    });
  }
}
