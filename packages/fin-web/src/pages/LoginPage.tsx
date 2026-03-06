import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.tsx";
import { verifyTotp } from "../api/auth.ts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FinLogo } from "@/components/FinLogo.tsx";
import { TotpVerifyForm } from "@/components/TotpVerifyForm.tsx";

export function LoginPage() {
  const { isAuthenticated, isLoading, login, setUserFromLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [totpToken, setTotpToken] = useState("");
  const [totpError, setTotpError] = useState("");
  const [totpSubmitting, setTotpSubmitting] = useState(false);

  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;

  if (totpToken) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col gap-4 w-full max-w-[360px] px-4">
          <div className="flex items-center justify-center gap-3 mb-2">
            <FinLogo className="h-9 w-9" />
            <h1 className="font-normal text-3xl text-foreground">fin</h1>
          </div>
          <TotpVerifyForm
            onVerify={handleTotpVerify}
            error={totpError}
            isSubmitting={totpSubmitting}
          />
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const result = await login(email, password);

      if (result.requiresTotp && result.totpToken) {
        setTotpToken(result.totpToken);
        return;
      }

      if (result.mustChangePassword) {
        navigate("/settings/security");
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTotpVerify(code: string) {
    setTotpError("");
    setTotpSubmitting(true);
    try {
      const response = await verifyTotp(totpToken, code);
      setUserFromLogin(response.user);
    } catch (err) {
      setTotpError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setTotpSubmitting(false);
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
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && (
          <p className="text-sm text-error text-center">{error}</p>
        )}
        <Button
          type="submit"
          disabled={isSubmitting || !email || !password}
          className="w-full"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <Link
            to="/forgot-password"
            className="text-muted-foreground hover:text-foreground"
          >
            Forgot password?
          </Link>
          <Link
            to="/register"
            className="text-primary hover:underline"
          >
            Create account
          </Link>
        </div>
      </form>
    </div>
  );
}
