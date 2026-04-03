import { exists, mkdir, readFile, writeFile, remove } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";

const CACHE_DIR_NAME = "image-cache";

let cacheDirPath: string | null = null;

async function getCacheDir(): Promise<string> {
  if (cacheDirPath) return cacheDirPath;
  const appData = await appDataDir();
  cacheDirPath = await join(appData, CACHE_DIR_NAME);
  const dirExists = await exists(cacheDirPath);
  if (!dirExists) {
    await mkdir(cacheDirPath, { recursive: true });
  }
  return cacheDirPath;
}

function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mimeType] || "bin";
}

export async function saveImageLocally(
  imageId: string,
  mimeType: string,
  data: Uint8Array,
): Promise<string> {
  const dir = await getCacheDir();
  const filename = `${imageId}.${extFromMime(mimeType)}`;
  const filePath = await join(dir, filename);
  await writeFile(filePath, data);
  return filePath;
}

export async function readCachedImage(
  imageId: string,
  mimeType: string,
): Promise<Uint8Array | null> {
  const dir = await getCacheDir();
  const filename = `${imageId}.${extFromMime(mimeType)}`;
  const filePath = await join(dir, filename);
  const fileExists = await exists(filePath);
  if (!fileExists) return null;
  return readFile(filePath);
}

export async function removeCachedImage(
  imageId: string,
  mimeType: string,
): Promise<void> {
  const dir = await getCacheDir();
  const filename = `${imageId}.${extFromMime(mimeType)}`;
  const filePath = await join(dir, filename);
  const fileExists = await exists(filePath);
  if (fileExists) {
    await remove(filePath);
  }
}
