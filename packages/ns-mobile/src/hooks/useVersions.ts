import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchVersions, restoreVersion } from "@/api/notes";

export function useVersions(noteId: string) {
  return useQuery({
    queryKey: ["versions", noteId],
    queryFn: () => fetchVersions(noteId),
    enabled: !!noteId,
  });
}

export function useRestoreVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      noteId,
      versionId,
    }: {
      noteId: string;
      versionId: string;
    }) => restoreVersion(noteId, versionId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["notes", variables.noteId] });
      queryClient.invalidateQueries({
        queryKey: ["versions", variables.noteId],
      });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
