import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext.tsx";
import { NsLogo } from "../components/NsLogo.tsx";
import { PasswordStrengthIndicator } from "../components/PasswordStrengthIndicator.tsx";
import { validatePasswordStrength } from "@derekentringer/shared";

interface RegisterPageProps {
  onNavigate: (view: "login") => void;
}

export function RegisterPage({ onNavigate }: RegisterPageProps) {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          <NsLogo className="w-8 h-8" />
          <h1 className="font-normal text-3xl text-foreground">NoteSync</h1>
        </div>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="text"
          placeholder="Display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="name"
          className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <PasswordStrengthIndicator password={password} />
        <input
          type="password"
          placeholder="Confirm password"
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
          disabled={isSubmitting || !email || !password || !confirmPassword}
          className="w-full px-4 py-2 rounded-md bg-primary text-primary-contrast font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
        <p className="text-sm text-muted-foreground text-center">
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => onNavigate("login")}
            className="text-primary hover:underline cursor-pointer"
          >
            Sign in
          </button>
        </p>
      </form>
    </div>
  );
}
