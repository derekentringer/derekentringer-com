import type {
  PdfImportPreviewResponse,
  PdfImportConfirmRequest,
  PdfImportConfirmResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function uploadPdfPreview(
  accountId: string,
  file: File,
  pinToken: string,
): Promise<PdfImportPreviewResponse> {
  const searchParams = new URLSearchParams({ accountId });

  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch(
    `/balances/import/preview?${searchParams.toString()}`,
    {
      method: "POST",
      body: formData,
      headers: { "x-pin-token": pinToken },
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to preview PDF import");
  }
  return res.json();
}

export async function confirmPdfImport(
  data: PdfImportConfirmRequest,
  pinToken: string,
): Promise<PdfImportConfirmResponse> {
  const res = await apiFetch("/balances/import/confirm", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "x-pin-token": pinToken },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to confirm PDF import");
  }
  return res.json();
}
