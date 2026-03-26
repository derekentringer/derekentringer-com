import { useQuery } from "@tanstack/react-query";
import { fetchBacklinks } from "@/api/notes";

export function useBacklinks(noteId: string) {
  return useQuery({
    queryKey: ["backlinks", noteId],
    queryFn: () => fetchBacklinks(noteId),
    enabled: !!noteId,
  });
}
