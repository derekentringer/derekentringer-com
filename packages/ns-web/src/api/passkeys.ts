import type {
  LoginResponse,
  PasskeyInfo,
} from "@derekentringer/shared";
import { apiFetch, setAccessToken } from "./client.ts";

export async function getRegisterOptions(): Promise<PublicKeyCredentialCreationOptions & Record<string, unknown>> {
  const response = await apiFetch("/auth/passkeys/register-options", { method: "POST" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to get registration options");
  }
  return response.json();
}

export async function verifyRegistration(
  credential: unknown,
  friendlyName?: string,
): Promise<{ id: string; friendlyName: string | null }> {
  const response = await apiFetch("/auth/passkeys/register-verify", {
    method: "POST",
    body: JSON.stringify({ credential, friendlyName }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to verify registration");
  }
  return response.json();
}

export async function getLoginOptions(
  email?: string,
): Promise<(PublicKeyCredentialRequestOptions & { challengeId: string }) & Record<string, unknown>> {
  const response = await apiFetch("/auth/passkeys/login-options", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to get login options");
  }
  return response.json();
}

export async function verifyLogin(
  credential: unknown,
  challengeId: string,
): Promise<LoginResponse> {
  const response = await apiFetch("/auth/passkeys/login-verify", {
    method: "POST",
    body: JSON.stringify({ credential, challengeId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Passkey authentication failed");
  }
  const data: LoginResponse = await response.json();
  setAccessToken(data.accessToken);
  return data;
}

export async function listPasskeys(): Promise<PasskeyInfo[]> {
  const response = await apiFetch("/auth/passkeys");
  if (!response.ok) {
    throw new Error("Failed to list passkeys");
  }
  const data: { passkeys: PasskeyInfo[] } = await response.json();
  return data.passkeys;
}

export async function deletePasskey(id: string): Promise<void> {
  const response = await apiFetch(`/auth/passkeys/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to delete passkey");
  }
}
