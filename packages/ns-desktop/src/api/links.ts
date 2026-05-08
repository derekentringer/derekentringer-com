import type { LinkPreview } from "@derekentringer/shared/ns";
import { apiFetch } from "./client";

/**
 * Calls the auth-required `GET /links/preview?url=` endpoint and
 * returns the parsed metadata. The endpoint always responds with a
 * `LinkPreview` shape on success — fields the upstream page didn't
 * supply come back as `null`. SSRF-blocked URLs return 403 and
 * malformed URLs return 400; both surface as thrown errors so the
 * caller can fall back to inserting the bare URL instead.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const res = await apiFetch(
    `/links/preview?url=${encodeURIComponent(url)}`,
  );
  if (!res.ok) {
    throw new Error(`link preview failed: ${res.status}`);
  }
  return (await res.json()) as LinkPreview;
}
