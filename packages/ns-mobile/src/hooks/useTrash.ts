import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  fetchTrash,
  restoreNote,
  permanentDeleteNote,
  emptyTrash,
} from "@/api/notes";

const TRASH_PAGE_SIZE = 50;

export function useTrash() {
  return useInfiniteQuery({
    queryKey: ["trash"],
    queryFn: ({ pageParam = 1 }) =>
      fetchTrash({ page: pageParam, pageSize: TRASH_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.notes.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
  });
}

export function useTrashCount() {
  return useQuery({
    queryKey: ["trash", "count"],
    queryFn: async () => {
      const data = await fetchTrash({ page: 1, pageSize: 1 });
      return data.total;
    },
    staleTime: 60 * 1000,
  });
}

export function useRestoreNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => restoreNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });
}

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
