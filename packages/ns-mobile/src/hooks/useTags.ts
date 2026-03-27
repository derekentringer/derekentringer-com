import { useQuery } from "@tanstack/react-query";
import { getTagsLocal } from "@/lib/noteStore";

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const tags = await getTagsLocal();
      return { tags };
    },
    staleTime: 5 * 60 * 1000,
  });
}
