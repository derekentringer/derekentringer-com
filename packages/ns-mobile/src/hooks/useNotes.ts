import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { CreateNoteRequest, UpdateNoteRequest, NoteSortField, SortOrder } from "@derekentringer/ns-shared";
import {
  getAllNotes,
  getNote,
  getDashboardData,
  createNoteLocal,
  updateNoteLocal,
  deleteNoteLocal,
  toggleFavoriteLocal,
} from "@/lib/noteStore";
import { notifyLocalChange } from "@/lib/syncEngine";

interface NoteFilters {
  folderId?: string;
  tags?: string[];
  search?: string;
  sortBy?: NoteSortField;
  sortOrder?: SortOrder;
}

export function useNotes(filters: NoteFilters) {
  return useQuery({
    queryKey: ["notes", filters],
    queryFn: () =>
      getAllNotes({
        folderId: filters.folderId,
        search: filters.search,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        tags: filters.tags,
      }),
  });
}

export function useNote(id: string) {
  return useQuery({
    queryKey: ["notes", id],
    queryFn: () => getNote(id),
    enabled: !!id,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboardData,
  });
}

export function useFavorites() {
  return useQuery({
    queryKey: ["favorites"],
    queryFn: () => getAllNotes({ favorite: true }),
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateNoteRequest) => createNoteLocal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      notifyLocalChange();
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNoteRequest }) =>
      updateNoteLocal(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["notes", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      notifyLocalChange();
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteNoteLocal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      notifyLocalChange();
    },
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      toggleFavoriteLocal(id, favorite),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["notes", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      notifyLocalChange();
    },
  });
}
