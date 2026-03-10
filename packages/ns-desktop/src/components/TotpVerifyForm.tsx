import { useState, useRef, useEffect } from "react";

interface TotpVerifyFormProps {
  onVerify: (code: string) => Promise<void>;
  error?: string;
  isSubmitting?: boolean;
}

export function TotpVerifyForm({ onVerify, error, isSubmitting }: TotpVerifyFormProps) {
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!useBackupCode) {
      inputRefs.current[0]?.focus();
    }
  }, [useBackupCode]);

  function handleDigitChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...digits];
    newDigits[index] = value.slice(-1);
    setDigits(newDigits);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    const code = newDigits.join("");
    if (code.length === 6) {
      onVerify(code);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(""));
      onVerify(pasted);
    }
  }

  function handleBackupSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (backupCode.trim()) {
      onVerify(backupCode.trim());
    }
  }

  if (useBackupCode) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground text-center">
          Enter a backup code
        </p>
        <form onSubmit={handleBackupSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Backup code"
            value={backupCode}
            onChange={(e) => setBackupCode(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-center tracking-widest"
          />
          {error && (
            <p className="text-sm text-error text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !backupCode.trim()}
            className="w-full px-4 py-2 rounded-md bg-primary text-primary-contrast font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {isSubmitting ? "Verifying..." : "Verify"}
          </button>
        </form>
        <button
          onClick={() => {
            setUseBackupCode(false);
            setBackupCode("");
          }}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Use authenticator app instead
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground text-center">
        Enter the 6-digit code from your authenticator app
      </p>
      <div className="flex justify-center gap-2" onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleDigitChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="w-10 h-12 text-center text-lg rounded-md bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isSubmitting}
          />
        ))}
      </div>
      {error && (
        <p className="text-sm text-error text-center">{error}</p>
      )}
      <button
        onClick={() => setUseBackupCode(true)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        Use a backup code instead
      </button>
    </div>
  );
}
