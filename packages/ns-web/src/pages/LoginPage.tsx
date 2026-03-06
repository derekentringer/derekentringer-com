import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.tsx";
import { NsLogo } from "../components/NsLogo.tsx";
import { TotpVerifyForm } from "../components/TotpVerifyForm.tsx";
import { login as apiLogin, verifyTotp } from "../api/auth.ts";

export function LoginPage() {
  const { isAuthenticated, isLoading, setUserFromLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // TOTP step
  const [totpToken, setTotpToken] = useState<string | null>(null);
  const [totpError, setTotpError] = useState("");
  const [totpSubmitting, setTotpSubmitting] = useState(false);

  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await apiLogin({ email, password });

      if (response.requiresTotp && response.totpToken) {
        setTotpToken(response.totpToken);
      } else if (response.user) {
        setUserFromLogin(response.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTotpVerify(code: string) {
    if (!totpToken) return;
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

  // TOTP verification step
  if (totpToken) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col gap-4 w-full max-w-[360px] px-4">
          <div className="flex items-center justify-center gap-3 mb-2">
            <NsLogo className="w-8 h-8" />
            <h1 className="font-normal text-3xl text-foreground">NoteSync</h1>
          </div>
          <TotpVerifyForm
            onVerify={handleTotpVerify}
            error={totpError}
            isSubmitting={totpSubmitting}
          />
          <button
            onClick={() => {
              setTotpToken(null);
              setTotpError("");
            }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
          >
            Back to login
          </button>
        </div>
      </div>
    );
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
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {error && (
          <p className="text-sm text-error text-center">{error}</p>
        )}
        <button
          type="submit"
          disabled={isSubmitting || !email || !password}
          className="w-full px-4 py-2 rounded-md bg-primary text-primary-contrast font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground">
            Forgot password?
          </Link>
          <Link to="/register" className="text-primary hover:underline">
            Create account
          </Link>
        </div>
      </form>
    </div>
  );
}
