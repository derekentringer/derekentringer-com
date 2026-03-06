import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.tsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FinLogo } from "@/components/FinLogo.tsx";
import { PasswordStrengthIndicator } from "@/components/PasswordStrengthIndicator.tsx";
import { resetPassword } from "../api/auth.ts";
import { validatePasswordStrength } from "@derekentringer/shared";

export function ResetPasswordPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;

  if (!token) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col gap-4 w-full max-w-[360px] px-4 text-center">
          <p className="text-sm text-error">Invalid reset link. No token provided.</p>
          <Link to="/login" className="text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const validation = validatePasswordStrength(password);
    if (!validation.valid) {
      setError(validation.errors[0]);
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(token!, password);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col gap-4 w-full max-w-[360px] px-4">
        <div className="flex items-center justify-center gap-3 mb-2">
          <FinLogo className="h-9 w-9" />
          <h1 className="font-normal text-3xl text-foreground">fin</h1>
        </div>
        {success ? (
          <>
            <p className="text-sm text-foreground text-center">
              Your password has been reset successfully.
            </p>
            <Button asChild className="w-full">
              <Link to="/login">Sign in</Link>
            </Button>
          </>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <p className="text-sm text-muted-foreground text-center">
              Enter your new password.
            </p>
            <Input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
            <PasswordStrengthIndicator password={password} />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            {error && (
              <p className="text-sm text-error text-center">{error}</p>
            )}
            <Button
              type="submit"
              disabled={isSubmitting || !password || !confirmPassword}
              className="w-full"
            >
              {isSubmitting ? "Resetting..." : "Reset password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
