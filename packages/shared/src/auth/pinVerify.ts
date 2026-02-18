import type { FastifyRequest, FastifyReply } from "fastify";
import type { PinJwtPayload } from "../types/auth.js";

export function requirePin(jwtSecret: string) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const pinToken = request.headers["x-pin-token"] as string;

    if (!pinToken) {
      return reply.status(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "PIN verification required",
      });
    }

    try {
      const decoded = request.server.jwt.verify<PinJwtPayload>(pinToken, {
        key: jwtSecret,
      });
      if (decoded.type !== "pin") {
        throw new Error("Invalid token type");
      }
    } catch {
      return reply.status(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Invalid or expired PIN token",
      });
    }
  };
}
