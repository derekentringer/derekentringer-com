import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RefreshResponse,
  User,
  TotpSetupResponse,
  TotpVerifySetupResponse,
} from "@derekentringer/shared";
import { apiFetch, setAccessToken } from "./client.ts";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3004";

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

export async function getMe(): Promise<User> {
  const response = await apiFetch("/auth/me");

  if (!response.ok) {
    throw new Error("Failed to get user profile");
  }

  const data: { user: User } = await response.json();
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    setAccessToken(null);
  }
}

export async function register(
  data: RegisterRequest,
): Promise<LoginResponse> {
  const response = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Registration failed");
  }

  const result: LoginResponse = await response.json();
  setAccessToken(result.accessToken);
  return result;
}

export async function forgotPassword(email: string): Promise<void> {
  const response = await apiFetch("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to send reset email");
  }
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  const response = await apiFetch("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to reset password");
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const response = await apiFetch("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to change password");
  }
}

export async function setupTotp(): Promise<TotpSetupResponse> {
  const response = await apiFetch("/auth/totp/setup", { method: "POST" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to start 2FA setup");
  }
  return response.json();
}

export async function verifyTotpSetup(code: string): Promise<TotpVerifySetupResponse> {
  const response = await apiFetch("/auth/totp/verify-setup", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Invalid verification code");
  }
  return response.json();
}

export async function verifyTotp(
  totpToken: string,
  code: string,
): Promise<LoginResponse> {
  const response = await apiFetch("/auth/totp/verify", {
    method: "POST",
    body: JSON.stringify({ totpToken, code }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Invalid verification code");
  }
  const data: LoginResponse = await response.json();
  setAccessToken(data.accessToken);
  return data;
}

export async function disableTotp(code: string): Promise<void> {
  const response = await apiFetch("/auth/totp", {
    method: "DELETE",
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to disable 2FA");
  }
}
