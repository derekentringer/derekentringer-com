import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getVersionInterval, setVersionInterval } from "@/api/notes";

const QUERY_KEY = ["versionInterval"] as const;

/**
 * Read the per-user version-snapshot capture interval in minutes.
 * `0` means "every save". Returns `undefined` while loading; the
 * settings UI shows the optimistic default (15) until the real
 * value lands so the chip row doesn't pop a moment after mount.
 */
export function useVersionInterval() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => getVersionInterval(),
    // The setting changes rarely; cache it for the session.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Mutation that updates the version-snapshot capture interval and
 * invalidates the cached value on success so the chip row re-
 * renders with the confirmed server state.
 */
export function useSetVersionInterval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (minutes: number) => setVersionInterval(minutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
