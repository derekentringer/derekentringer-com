import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AuthPluginOptions } from "../types/auth.js";
import "./types.js";

async function auth(fastify: FastifyInstance, opts: AuthPluginOptions) {
  await fastify.register(jwt, {
    secret: opts.jwtSecret,
    sign: { expiresIn: opts.accessTokenExpiry || "15m" },
  });

  fastify.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid or expired token",
        });
      }
    },
  );
}

export default fp(auth, { name: "auth-plugin" });
