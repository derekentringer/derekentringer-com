import type {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  PinVerifyResponse,
} from "@derekentringer/shared";
import { apiFetch, setAccessToken } from "./client.ts";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

export async function login(
  credentials: LoginRequest,
): Promise<LoginResponse> {
  const response = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Login failed");
  }

  const data: LoginResponse = await response.json();
  setAccessToken(data.accessToken);
  return data;
}

export async function refreshSession(): Promise<RefreshResponse | null> {
  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const data: RefreshResponse = await response.json();
    setAccessToken(data.accessToken);
    return data;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    setAccessToken(null);
  }
}

export async function verifyPin(pin: string): Promise<PinVerifyResponse> {
  const response = await apiFetch("/auth/pin/verify", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "PIN verification failed");
  }

  return response.json();
}
