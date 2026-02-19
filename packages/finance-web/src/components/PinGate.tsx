import { useState } from "react";
import type { FormEvent } from "react";
import { usePin } from "../context/PinContext.tsx";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PinGate({ children }: { children: React.ReactNode }) {
  const { isPinVerified, verifyPin } = usePin();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isPinVerified) {
    return <>{children}</>;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await verifyPin(pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PIN verification failed");
      setPin("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/85 z-[1000]">
      <Card className="w-full max-w-[360px] mx-4">
        <CardContent className="p-8">
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <h2 className="font-thin text-2xl text-center">Enter PIN</h2>
            <p className="text-sm text-center text-foreground/60">
              A PIN is required to access this section
            </p>
            <Input
              type="password"
              placeholder="PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
            />
            {error && (
              <p className="text-sm text-error text-center">{error}</p>
            )}
            <Button
              type="submit"
              disabled={isSubmitting || !pin}
              className="w-full"
            >
              {isSubmitting ? "Verifying..." : "Verify"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
