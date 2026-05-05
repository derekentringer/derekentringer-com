import React, { createContext, useCallback, useContext, useState } from "react";
import { AppDialog, type AppDialogButton } from "@/components/AppDialog";

/** Drop-in imperative replacement for `react-native`'s `Alert.alert`.
 *  Mirrors the same `(title, message, buttons)` signature so call
 *  sites can swap by importing `useAppAlert` and calling the
 *  returned function instead of `Alert.alert`. */
export type ShowAlertFn = (
  title: string,
  message?: string,
  buttons?: AppDialogButton[],
) => void;

const AppAlertContext = createContext<ShowAlertFn | null>(null);

interface DialogState {
  title: string;
  message?: string;
  buttons?: AppDialogButton[];
}

export function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);

  const showAlert = useCallback<ShowAlertFn>((title, message, buttons) => {
    setState({ title, message, buttons });
  }, []);

  const handleDismiss = useCallback(() => {
    setState(null);
  }, []);

  return (
    <AppAlertContext.Provider value={showAlert}>
      {children}
      <AppDialog
        visible={state !== null}
        title={state?.title ?? ""}
        message={state?.message}
        buttons={state?.buttons}
        onDismiss={handleDismiss}
      />
    </AppAlertContext.Provider>
  );
}

export function useAppAlert(): ShowAlertFn {
  const ctx = useContext(AppAlertContext);
  if (!ctx) {
    throw new Error("useAppAlert must be called within an AppAlertProvider");
  }
  return ctx;
}
