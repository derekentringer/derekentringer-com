import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.tsx";
import { NsLogo } from "../components/NsLogo.tsx";
import { forgotPassword } from "../api/auth.ts";

export function ForgotPasswordPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col gap-4 w-full max-w-[360px] px-4">
        <div className="flex items-center justify-center gap-3 mb-2">
          <NsLogo className="w-8 h-8" />
          <h1 className="font-normal text-3xl text-foreground">NoteSync</h1>
        </div>
        {sent ? (
          <>
            <p className="text-sm text-foreground text-center">
              If an account exists with that email, a reset link has been sent. Check your inbox.
            </p>
            <Link
              to="/login"
              className="text-sm text-primary hover:underline text-center"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <p className="text-sm text-muted-foreground text-center">
              Enter your email and we'll send you a link to reset your password.
            </p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {error && (
              <p className="text-sm text-error text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={isSubmitting || !email}
              className="w-full px-4 py-2 rounded-md bg-primary text-primary-contrast font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Sending..." : "Send reset link"}
            </button>
            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-foreground text-center"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
