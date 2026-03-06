import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.tsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FinLogo } from "@/components/FinLogo.tsx";
import { PasswordStrengthIndicator } from "@/components/PasswordStrengthIndicator.tsx";
import { validatePasswordStrength } from "@derekentringer/shared";

export function RegisterPage() {
  const { isAuthenticated, isLoading, register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;

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
      await register(email, password, displayName || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
          <FinLogo className="h-9 w-9" />
          <h1 className="font-normal text-3xl text-foreground">fin</h1>
        </div>
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
        />
        <Input
          type="text"
          placeholder="Display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="name"
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <PasswordStrengthIndicator password={password} />
        <Input
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
        {error && (
          <p className="text-sm text-error text-center">{error}</p>
        )}
        <Button
          type="submit"
          disabled={isSubmitting || !email || !password || !confirmPassword}
          className="w-full"
        >
          {isSubmitting ? "Creating account..." : "Create account"}
        </Button>
        <p className="text-sm text-muted-foreground text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
