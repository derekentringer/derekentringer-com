import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
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
