import { useState } from "react";
import type { FormEvent } from "react";
import { NsLogo } from "../components/NsLogo.tsx";
import { PasswordStrengthIndicator } from "../components/PasswordStrengthIndicator.tsx";
import { changePassword } from "../api/auth.ts";
import { validatePasswordStrength } from "@derekentringer/shared";

interface ChangePasswordPageProps {
  onBack: () => void;
}

export function ChangePasswordPage({ onBack }: ChangePasswordPageProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      setError(validation.errors[0]);
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center h-full">
      <form
        className="flex flex-col gap-4 w-full max-w-[360px] px-4"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <NsLogo className="w-8 h-8" />
          <h1 className="font-normal text-3xl text-foreground">NoteSync</h1>
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Change your password
        </p>
        <input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <PasswordStrengthIndicator password={newPassword} />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {error && (
          <p className="text-sm text-error text-center">{error}</p>
        )}
        <button
          type="submit"
          disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
          className="w-full px-4 py-2 rounded-md bg-primary text-primary-contrast font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {isSubmitting ? "Changing..." : "Change password"}
        </button>
      </form>
    </div>
  );
}
