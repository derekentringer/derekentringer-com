import { useState, useEffect, useCallback } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.tsx";
import {
  getUsers,
  resetUserPassword,
  deleteUser,
  getApprovedEmails,
  setApprovedEmails,
  getAdminAiSettings,
  setAdminAiSettings,
} from "../api/admin.ts";
import type { AdminUser } from "../api/admin.ts";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </h2>
      {children}
    </div>
  );
}

function ToggleSwitch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between py-3 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
      <span className="text-sm text-foreground">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-border"
        } ${disabled ? "cursor-not-allowed" : ""}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}

export function AdminPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  const [approvedEmailsText, setApprovedEmailsText] = useState("");
  const [emailsSaving, setEmailsSaving] = useState(false);
  const [emailsStatus, setEmailsStatus] = useState("");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const [resetDialog, setResetDialog] = useState<{ userId: string; email: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");

  const [deleteDialog, setDeleteDialog] = useState<{ userId: string; email: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "admin") return <Navigate to="/" replace />;

  const loadData = useCallback(async () => {
    try {
      const [usersData, emailsData, aiData] = await Promise.all([
        getUsers(),
        getApprovedEmails(),
        getAdminAiSettings(),
      ]);
      setUsers(usersData);
      setApprovedEmailsText(emailsData.join("\n"));
      setAiEnabled(aiData.aiEnabled);
    } catch {
      // Silently handle load errors
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAiToggle(enabled: boolean) {
    setAiLoading(true);
    try {
      const result = await setAdminAiSettings(enabled);
      setAiEnabled(result.aiEnabled);
    } catch {
      // Revert on error
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSaveEmails() {
    setEmailsSaving(true);
    setEmailsStatus("");
    try {
      const emails = approvedEmailsText
        .split(/[,\n]/)
        .map((e) => e.trim())
        .filter(Boolean);
      const saved = await setApprovedEmails(emails);
      setApprovedEmailsText(saved.join("\n"));
      setEmailsStatus("Saved");
      setTimeout(() => setEmailsStatus(""), 2000);
    } catch {
      setEmailsStatus("Failed to save");
    } finally {
      setEmailsSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!resetDialog || !resetPassword) return;
    setResetError("");
    try {
      await resetUserPassword(resetDialog.userId, resetPassword);
      setResetDialog(null);
      setResetPassword("");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Failed to reset password");
    }
  }

  async function handleDeleteUser() {
    if (!deleteDialog) return;
    setDeleteError("");
    try {
      await deleteUser(deleteDialog.userId);
      setUsers((prev) => prev.filter((u) => u.id !== deleteDialog.userId));
      setDeleteDialog(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete user");
    }
  }

  return (
    <div className="flex h-full items-start justify-center bg-background overflow-auto">
      <div className="w-full max-w-2xl p-6">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </button>

        <h1 className="text-xl font-semibold text-foreground mb-6">Admin</h1>

        <div className="flex flex-col gap-4">
          {/* AI Controls */}
          <SectionCard title="AI Controls">
            <ToggleSwitch
              label="Enable AI features globally"
              checked={aiEnabled}
              onChange={handleAiToggle}
              disabled={aiLoading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              When disabled, all AI features (completions, summaries, tags, Q&A, transcription) are blocked for all users.
            </p>
          </SectionCard>

          {/* Approved Emails */}
          <SectionCard title="Approved Emails">
            <p className="text-xs text-muted-foreground mb-2">
              Only these email addresses can register. One per line or comma-separated.
            </p>
            <textarea
              value={approvedEmailsText}
              onChange={(e) => setApprovedEmailsText(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder="user@example.com"
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleSaveEmails}
                disabled={emailsSaving}
                className="px-3 py-1.5 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                {emailsSaving ? "Saving..." : "Save"}
              </button>
              {emailsStatus && (
                <span className={`text-sm ${emailsStatus === "Saved" ? "text-green-500" : "text-error"}`}>
                  {emailsStatus}
                </span>
              )}
            </div>
          </SectionCard>

          {/* User Management */}
          <SectionCard title="User Management">
            {usersLoading ? (
              <p className="text-sm text-muted-foreground py-2">Loading...</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No users found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 font-medium">Name</th>
                      <th className="py-2 pr-4 font-medium">Role</th>
                      <th className="py-2 pr-4 font-medium">2FA</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-4 text-foreground">{u.email}</td>
                        <td className="py-2 pr-4 text-foreground">{u.displayName || "—"}</td>
                        <td className="py-2 pr-4">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${u.role === "admin" ? "bg-primary/20 text-primary" : "bg-border text-muted-foreground"}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{u.totpEnabled ? "On" : "Off"}</td>
                        <td className="py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setResetDialog({ userId: u.id, email: u.email });
                                setResetPassword("");
                                setResetError("");
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Reset pw
                            </button>
                            {u.role !== "admin" && (
                              <button
                                onClick={() => {
                                  setDeleteDialog({ userId: u.id, email: u.email });
                                  setDeleteError("");
                                }}
                                className="text-xs text-error/70 hover:text-error transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Reset Password Dialog */}
      {resetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-sm shadow-lg">
            <h3 className="text-base font-medium text-foreground mb-1">Reset Password</h3>
            <p className="text-sm text-muted-foreground mb-4">{resetDialog.email}</p>
            <input
              type="password"
              placeholder="New password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring mb-2"
            />
            {resetError && <p className="text-sm text-error mb-2">{resetError}</p>}
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setResetDialog(null)}
                className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={!resetPassword}
                className="px-3 py-1.5 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Dialog */}
      {deleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-sm shadow-lg">
            <h3 className="text-base font-medium text-foreground mb-1">Delete User</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Permanently delete <strong>{deleteDialog.email}</strong> and all their data?
            </p>
            {deleteError && <p className="text-sm text-error mb-2">{deleteError}</p>}
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setDeleteDialog(null)}
                className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
