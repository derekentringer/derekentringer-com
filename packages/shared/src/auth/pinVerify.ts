import jwt from "jsonwebtoken";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { PinJwtPayload } from "../types/auth.js";

export function requirePin(pinTokenSecret: string) {
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
      const decoded = jwt.verify(pinToken, pinTokenSecret) as PinJwtPayload;
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

export function signPinToken(
  payload: { sub: string; type: "pin" },
  pinTokenSecret: string,
  expiresIn: number = 900,
): string {
  return jwt.sign(payload, pinTokenSecret, { expiresIn });
}
