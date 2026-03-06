import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.tsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FinLogo } from "@/components/FinLogo.tsx";
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
          <FinLogo className="h-9 w-9" />
          <h1 className="font-normal text-3xl text-foreground">fin</h1>
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
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
            {error && (
              <p className="text-sm text-error text-center">{error}</p>
            )}
            <Button
              type="submit"
              disabled={isSubmitting || !email}
              className="w-full"
            >
              {isSubmitting ? "Sending..." : "Send reset link"}
            </Button>
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
