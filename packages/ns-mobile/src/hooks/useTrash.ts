import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { getAllNotes, restoreNoteLocal } from "@/lib/noteStore";
import {
  permanentDeleteNote,
  emptyTrash,
} from "@/api/notes";
import { notifyLocalChange } from "@/lib/syncEngine";

export function useTrash() {
  return useQuery({
    queryKey: ["trash"],
    queryFn: () => getAllNotes({ deletedOnly: true }),
  });
}

export function useTrashCount() {
  return useQuery({
    queryKey: ["trash", "count"],
    queryFn: async () => {
      const notes = await getAllNotes({ deletedOnly: true });
      return notes.length;
    },
    staleTime: 60 * 1000,
  });
}

export function useRestoreNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => restoreNoteLocal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      notifyLocalChange();
    },
  });
}

// Permanent delete stays API-only (server-side operation)
export function usePermanentDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => permanentDeleteNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
  });
}

export function useEmptyTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => emptyTrash(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
  });
}
