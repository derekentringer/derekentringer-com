import { useState, useRef, useCallback, useEffect } from "react";
import type { CreateNoteRequest, UpdateNoteRequest } from "@derekentringer/ns-shared";
import { createNoteLocal, updateNoteLocal } from "@/lib/noteStore";
import { notifyLocalChange } from "@/lib/syncEngine";
import { useQueryClient } from "@tanstack/react-query";

interface AutoSaveState {
  isSaving: boolean;
  isSaved: boolean;
  error: string | null;
}

interface UseAutoSaveOptions {
  noteId: string | undefined;
  onCreated?: (newId: string) => void;
  delay?: number;
}

export function useAutoSave({ noteId, onCreated, delay = 500 }: UseAutoSaveOptions) {
  const [state, setState] = useState<AutoSaveState>({
    isSaving: false,
    isSaved: false,
    error: null,
  });

  const queryClient = useQueryClient();
  const currentNoteId = useRef(noteId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<CreateNoteRequest | UpdateNoteRequest | null>(null);

  useEffect(() => {
    currentNoteId.current = noteId;
  }, [noteId]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const data = pendingRef.current;
    if (!data) return;
    pendingRef.current = null;

    setState({ isSaving: true, isSaved: false, error: null });

    try {
      if (currentNoteId.current) {
        await updateNoteLocal(currentNoteId.current, data as UpdateNoteRequest);
      } else {
        const created = await createNoteLocal(data as CreateNoteRequest);
        currentNoteId.current = created.id;
        onCreated?.(created.id);
      }
      notifyLocalChange();
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setState({ isSaving: false, isSaved: true, error: null });
    } catch (err) {
      setState({
        isSaving: false,
        isSaved: false,
        error: err instanceof Error ? err.message : "Save failed",
      });
    }
  }, [onCreated, queryClient]);

  const save = useCallback(
    (data: CreateNoteRequest | UpdateNoteRequest) => {
      pendingRef.current = data;
      setState((prev) => ({ ...prev, isSaved: false, error: null }));

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(flush, delay);
    },
    [flush, delay],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    save,
    flush,
    ...state,
  };
}
