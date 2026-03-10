import { apiFetch } from "./client.ts";

export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  totpEnabled: boolean;
  createdAt: string;
}

export async function getUsers(): Promise<AdminUser[]> {
  const response = await apiFetch("/admin/users");
  if (!response.ok) {
    throw new Error("Failed to fetch users");
  }
  const data: { users: AdminUser[] } = await response.json();
  return data.users;
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  const response = await apiFetch(`/admin/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to reset password");
  }
}

export async function deleteUser(userId: string): Promise<void> {
  const response = await apiFetch(`/admin/users/${userId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to delete user");
  }
}

export async function getApprovedEmails(): Promise<string[]> {
  const response = await apiFetch("/admin/approved-emails");
  if (!response.ok) {
    throw new Error("Failed to fetch approved emails");
  }
  const data: { emails: string[] } = await response.json();
  return data.emails;
}

export async function setApprovedEmails(emails: string[]): Promise<string[]> {
  const response = await apiFetch("/admin/approved-emails", {
    method: "PUT",
    body: JSON.stringify({ emails }),
  });
  if (!response.ok) {
    throw new Error("Failed to update approved emails");
  }
  const data: { emails: string[] } = await response.json();
  return data.emails;
}

export async function getAdminAiSettings(): Promise<{ aiEnabled: boolean }> {
  const response = await apiFetch("/admin/ai-settings");
  if (!response.ok) {
    throw new Error("Failed to fetch AI settings");
  }
  return response.json();
}

export async function setAdminAiSettings(
  aiEnabled: boolean,
): Promise<{ aiEnabled: boolean }> {
  const response = await apiFetch("/admin/ai-settings", {
    method: "PUT",
    body: JSON.stringify({ aiEnabled }),
  });
  if (!response.ok) {
    throw new Error("Failed to update AI settings");
  }
  return response.json();
}
