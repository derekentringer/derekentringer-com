import type { LinkPreview } from "@derekentringer/ns-shared";
import api from "@/services/api";

/**
 * Calls the auth-required `GET /links/preview?url=` endpoint and
 * returns the parsed metadata. The endpoint always responds with a
 * `LinkPreview` shape on success — fields that the upstream page
 * didn't supply come back as `null`. Network / SSRF / 4xx errors
 * surface as axios errors and are caught at the call site so the
 * receiver overlay can fall back to bare-URL behavior.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const { data } = await api.get<LinkPreview>("/links/preview", {
    params: { url },
  });
  return data;
}
