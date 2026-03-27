import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getFolders,
  createFolderLocal,
  renameFolderLocal,
  deleteFolderLocal,
} from "@/lib/noteStore";
import { notifyLocalChange } from "@/lib/syncEngine";

export function useFolders() {
  return useQuery({
    queryKey: ["folders"],
    queryFn: async () => {
      const folders = await getFolders();
      return { folders };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId?: string }) =>
      createFolderLocal(name, parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      notifyLocalChange();
    },
  });
}

export function useRenameFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      folderId,
      newName,
    }: {
      folderId: string;
      newName: string;
    }) => renameFolderLocal(folderId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      notifyLocalChange();
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      folderId,
      mode,
    }: {
      folderId: string;
      mode?: "move-up" | "recursive";
    }) => deleteFolderLocal(folderId, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      notifyLocalChange();
    },
  });
}
