import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  fetchLinkPreview,
  InvalidUrlError,
  SsrfBlockedError,
} from "../services/linksPreviewService.js";

interface PreviewQuery {
  url?: string;
}

export default async function linkRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  fastify.get(
    "/preview",
    async (
      request: FastifyRequest<{ Querystring: PreviewQuery }>,
      reply: FastifyReply,
    ) => {
      const url = request.query.url?.trim();
      if (!url) {
        return reply
          .status(400)
          .send({ error: "BadRequest", message: "url query param is required" });
      }
      try {
        const preview = await fetchLinkPreview(url);
        return reply.send(preview);
      } catch (err) {
        if (err instanceof InvalidUrlError) {
          return reply
            .status(400)
            .send({ error: "InvalidUrl", message: err.message });
        }
        if (err instanceof SsrfBlockedError) {
          return reply
            .status(403)
            .send({ error: "Forbidden", message: err.message });
        }
        request.log.error({ err, url }, "link preview failed");
        return reply
          .status(502)
          .send({ error: "BadGateway", message: "preview fetch failed" });
      }
    },
  );
}
