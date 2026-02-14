import { useState } from "react";
import type { FormEvent } from "react";
import { usePin } from "../context/PinContext.tsx";
import styles from "./PinGate.module.css";

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
    <div className={styles.overlay}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h2 className={styles.title}>Enter PIN</h2>
        <p className={styles.subtitle}>
          A PIN is required to access this section
        </p>
        <input
          className={styles.input}
          type="password"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
        />
        {error && <p className={styles.error}>{error}</p>}
        <button
          className={styles.button}
          type="submit"
          disabled={isSubmitting || !pin}
        >
          {isSubmitting ? "Verifying..." : "Verify"}
        </button>
      </form>
    </div>
  );
}
