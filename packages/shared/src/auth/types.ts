import type { FastifyRequest, FastifyReply } from "fastify";
import type { JwtPayload } from "../types/auth.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; username: string };
    user: JwtPayload;
  }
}

export {};
