import { useState } from "react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { getLoginOptions, verifyLogin } from "../api/passkeys.ts";
import type { User } from "@derekentringer/shared";

interface PasskeyButtonProps {
  onSuccess: (user: User) => void;
  onError?: (error: string) => void;
}

export function PasskeyButton({ onSuccess, onError }: PasskeyButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  if (!browserSupportsWebAuthn()) {
    return null;
  }

  async function handlePasskeyLogin() {
    setIsLoading(true);
    try {
      const optionsResponse = await getLoginOptions();
      const { challengeId, ...optionsJSON } = optionsResponse;

      const credential = await startAuthentication({
        optionsJSON: optionsJSON as unknown as PublicKeyCredentialRequestOptionsJSON,
      });

      const response = await verifyLogin(credential, challengeId);
      onSuccess(response.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Passkey authentication failed";
      // Don't report user cancellation as an error
      if (message.includes("The operation either timed out or was not allowed")) {
        setIsLoading(false);
        return;
      }
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handlePasskeyLogin}
      disabled={isLoading}
      className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-border bg-input text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 10a2 2 0 0 0-2 2c0 1.02.76 1.85 1.75 1.97V16h.5v-2.03A2.001 2.001 0 0 0 12 10z" />
        <path d="M7 21h10a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V5a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2zM10 5a2 2 0 0 1 4 0v2h-4V5z" />
      </svg>
      {isLoading ? "Authenticating..." : "Sign in with passkey"}
    </button>
  );
}
