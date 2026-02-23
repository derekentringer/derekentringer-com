import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { verifyPin as apiVerifyPin } from "../api/auth.ts";

interface PinState {
  pinToken: string | null;
  isPinVerified: boolean;
  verifyPin: (pin: string) => Promise<void>;
  clearPin: () => void;
}

const PinContext = createContext<PinState | null>(null);

export function PinProvider({ children }: { children: ReactNode }) {
  const [pinToken, setPinToken] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPin = useCallback(() => {
    setPinToken(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const verifyPin = useCallback(
    async (pin: string) => {
      const response = await apiVerifyPin(pin);
      setPinToken(response.pinToken);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        clearPin();
      }, response.expiresIn * 1000);
    },
    [clearPin],
  );

  useEffect(() => {
    const handleLogout = () => clearPin();
    window.addEventListener("auth:logout", handleLogout);
    return () => {
      window.removeEventListener("auth:logout", handleLogout);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [clearPin]);

  return (
    <PinContext.Provider
      value={{
        pinToken,
        isPinVerified: pinToken !== null,
        verifyPin,
        clearPin,
      }}
    >
      {children}
    </PinContext.Provider>
  );
}

export function usePin(): PinState {
  const context = useContext(PinContext);
  if (!context) {
    throw new Error("usePin must be used within a PinProvider");
  }
  return context;
}
