import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { getAllNotes, restoreNoteLocal } from "@/lib/noteStore";
import {
  fetchTrash,
  permanentDeleteNote,
  emptyTrash,
} from "@/api/notes";
import { notifyLocalChange } from "@/lib/syncEngine";
import useSyncStore from "@/store/syncStore";

export function useTrash() {
  return useQuery({
    queryKey: ["trash"],
    queryFn: () => getAllNotes({ deletedOnly: true }),
  });
}

export function useTrashCount() {
  // Source the badge count from the server's `/notes/trash` total
  // when online so it matches what web + desktop show. Sync push
  // is asynchronous on mobile, so a pure-local count drifts
  // whenever there are pending soft-deletes / restores in either
  // direction. If we're offline, fall back to the local SQLite
  // count.
  const isOnline = useSyncStore((s) => s.isOnline);
  return useQuery({
    queryKey: ["trash", "count", isOnline],
    queryFn: async () => {
      if (isOnline) {
        try {
          const result = await fetchTrash({ pageSize: 1 });
          return result.total ?? 0;
        } catch {
          // Network blip — fall through to the local count.
        }
      }
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
