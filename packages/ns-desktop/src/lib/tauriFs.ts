import { writeFile } from "@tauri-apps/plugin-fs";

/**
 * Write binary data to a file path. Wraps Tauri's writeFile
 * with explicit Uint8Array construction to avoid TypeScript
 * ArrayBufferLike compatibility issues.
 */
export async function writeBinaryFile(
  path: string,
  data: Uint8Array,
): Promise<void> {
  await writeFile(path, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}
