import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { createImage, getImagesByNoteId, softDeleteImage, getImage } from "../store/imageStore.js";
import { buildR2Key, uploadImage, deleteImage as deleteR2Image } from "../services/r2Service.js";
import { analyzeImage } from "../services/aiService.js";
import { updateImageAiDescription } from "../store/imageStore.js";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

const VALID_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function validateImageMagicBytes(buffer: Buffer, mimetype: string): boolean {
  if (buffer.length < 8) return false;

  switch (mimetype) {
    case "image/jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    case "image/png":
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );

    case "image/webp":
      return (
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
      );

    case "image/gif":
      return (
        buffer.toString("ascii", 0, 6) === "GIF87a" ||
        buffer.toString("ascii", 0, 6) === "GIF89a"
      );

    default:
      return false;
  }
}

export default async function imageRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  // POST /images/upload
  fastify.post(
    "/upload",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.sub;
      let file: { buffer: Buffer; filename: string; mimetype: string } | undefined;
      let noteId = "";
      let altText = "";

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "field" && part.fieldname === "noteId") {
            noteId = (part.value as string) || "";
          } else if (part.type === "field" && part.fieldname === "altText") {
            altText = (part.value as string) || "";
          } else if (part.type === "file" && part.fieldname === "file") {
            file = {
              buffer: await part.toBuffer(),
              filename: part.filename,
              mimetype: part.mimetype,
            };
          }
        }
      } catch {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid multipart data",
        });
      }

      if (!file) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "No image file provided",
        });
      }

      if (!noteId) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "noteId is required",
        });
      }

      if (!VALID_IMAGE_TYPES.has(file.mimetype)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `Unsupported image type: ${file.mimetype}`,
        });
      }

      if (file.buffer.length > MAX_IMAGE_SIZE) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `Image exceeds ${MAX_IMAGE_SIZE / 1024 / 1024}MB limit`,
        });
      }

      if (!validateImageMagicBytes(file.buffer, file.mimetype)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "File content does not match declared image type",
        });
      }

      const imageId = randomUUID();
      const ext = MIME_TO_EXT[file.mimetype] || "bin";
      const r2Key = buildR2Key(imageId, ext);

      let r2Url: string;
      try {
        r2Url = await uploadImage(file.buffer, r2Key, file.mimetype);
      } catch (err) {
        request.log.error(err, "R2 upload failed");
        return reply.status(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message: "Failed to upload image to storage",
        });
      }

      const image = await createImage(userId, noteId, {
        id: imageId,
        filename: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.buffer.length,
        r2Key,
        r2Url,
        altText,
      });

      // Fire-and-forget AI description
      const base64 = file.buffer.toString("base64");
      analyzeImage(base64, file.mimetype)
        .then((description) => updateImageAiDescription(imageId, description))
        .catch((err) => request.log.error(err, "Image AI analysis failed"));

      return reply.send({
        id: image.id,
        r2Url: image.r2Url,
        altText: image.altText,
      });
    },
  );

  // GET /images/note/:noteId
  fastify.get<{ Params: { noteId: string } }>(
    "/note/:noteId",
    async (request: FastifyRequest<{ Params: { noteId: string } }>, reply: FastifyReply) => {
      const userId = request.user.sub;
      const images = await getImagesByNoteId(userId, request.params.noteId);
      return reply.send({
        images: images.map((img) => ({
          id: img.id,
          noteId: img.noteId,
          filename: img.filename,
          mimeType: img.mimeType,
          sizeBytes: img.sizeBytes,
          r2Url: img.r2Url,
          altText: img.altText,
          aiDescription: img.aiDescription,
          createdAt: img.createdAt.toISOString(),
        })),
      });
    },
  );

  // DELETE /images/:imageId
  fastify.delete<{ Params: { imageId: string } }>(
    "/:imageId",
    async (request: FastifyRequest<{ Params: { imageId: string } }>, reply: FastifyReply) => {
      const userId = request.user.sub;
      const image = await getImage(userId, request.params.imageId);
      if (!image) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Image not found",
        });
      }

      await softDeleteImage(userId, request.params.imageId);

      // Fire-and-forget R2 cleanup
      deleteR2Image(image.r2Key).catch((err) =>
        request.log.error(err, "R2 delete failed"),
      );

      return reply.status(204).send();
    },
  );
}
