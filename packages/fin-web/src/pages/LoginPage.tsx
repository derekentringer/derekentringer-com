import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.tsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FinLogo } from "@/components/FinLogo.tsx";

export function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
          type="text"
          placeholder="Username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
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
      </form>
    </div>
  );
}
