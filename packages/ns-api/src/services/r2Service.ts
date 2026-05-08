import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { loadConfig } from "../config.js";

let s3Client: S3Client | null = null;

function getClient(): S3Client {
  if (!s3Client) {
    const config = loadConfig();
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey,
      },
    });
  }
  return s3Client;
}

function getBucketName(): string {
  return loadConfig().r2BucketName;
}

function getPublicUrl(r2Key: string): string {
  const config = loadConfig();
  if (config.r2PublicUrl) {
    return `${config.r2PublicUrl}/${r2Key}`;
  }
  return `https://${config.r2BucketName}.${config.r2AccountId}.r2.dev/${r2Key}`;
}

export function buildR2Key(
  imageId: string,
  ext: string,
): string {
  return `${imageId}.${ext}`;
}

export async function uploadImage(
  buffer: Buffer,
  r2Key: string,
  mimeType: string,
): Promise<string> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: r2Key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );
  return getPublicUrl(r2Key);
}

export async function deleteImage(r2Key: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: r2Key,
    }),
  );
}

export async function deleteImages(r2Keys: string[]): Promise<void> {
  if (r2Keys.length === 0) return;
  const client = getClient();
  await client.send(
    new DeleteObjectsCommand({
      Bucket: getBucketName(),
      Delete: {
        Objects: r2Keys.map((Key) => ({ Key })),
        Quiet: true,
      },
    }),
  );
}

// Phase H — generic R2 helpers used by transcription audio, which
// shares the same bucket as images (different key prefix). Audio
// objects live under `audio/{userId}/{sessionId}.{ext}`. Keyed by
// sessionId (not jobId) because Retry reuses the same session and
// re-points at the same R2 object — saves an upload on Retry.

export function buildAudioR2Key(
  userId: string,
  sessionId: string,
  ext: string,
): string {
  return `audio/${userId}/${sessionId}.${ext}`;
}

export async function uploadAudio(
  buffer: Buffer,
  r2Key: string,
  mimeType: string,
): Promise<void> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: r2Key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );
}

export async function fetchAudio(r2Key: string): Promise<Buffer> {
  const client = getClient();
  const result = await client.send(
    new GetObjectCommand({ Bucket: getBucketName(), Key: r2Key }),
  );
  if (!result.Body) {
    throw new Error(`R2 object not found: ${r2Key}`);
  }
  // Body is a Readable stream; collect into a Buffer.
  const chunks: Uint8Array[] = [];
  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function deleteAudio(r2Key: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({ Bucket: getBucketName(), Key: r2Key }),
  );
}

// Phase E.4 — link-preview thumbnails. Stored under their own
// `link-previews/` prefix in the same bucket so they don't mingle
// with user-owned image uploads. Keyed by SHA-256(image URL) so
// the same publisher-side image (e.g. a CMS hero image) is reused
// across users sharing the same article.

export function buildLinkPreviewR2Key(
  urlHash: string,
  ext: string,
): string {
  return `link-previews/${urlHash}.${ext}`;
}

export async function uploadLinkPreviewImage(
  buffer: Buffer,
  r2Key: string,
  mimeType: string,
): Promise<string> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: r2Key,
      Body: buffer,
      ContentType: mimeType,
      // Cache aggressively: the key is content-addressed, so it
      // never changes content. A long max-age lets the public R2
      // URL be served from the edge without re-hitting origin.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return getPublicUrl(r2Key);
}
