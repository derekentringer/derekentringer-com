import { useEffect } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import useSyncStore, { type ConnectionType } from "@/store/syncStore";

/** Map the netinfo string union onto our narrower ConnectionType.
 *  Anything that isn't wifi / cellular / none collapses to "other"
 *  so feature code only has to branch on the cases it cares about. */
function classifyType(state: NetInfoState): ConnectionType {
  if (state.type === "wifi") return "wifi";
  if (state.type === "cellular") return "cellular";
  if (state.type === "none") return "none";
  if (state.type === "unknown") return "unknown";
  return "other";
}

export function useNetworkStatus() {
  const setIsOnline = useSyncStore((s) => s.setIsOnline);
  const setConnectionType = useSyncStore((s) => s.setConnectionType);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected && !!state.isInternetReachable);
      setConnectionType(classifyType(state));
    });
    return () => unsubscribe();
  }, [setIsOnline, setConnectionType]);
}
