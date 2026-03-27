import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import useSyncStore from "@/store/syncStore";

export function useNetworkStatus() {
  const setIsOnline = useSyncStore((s) => s.setIsOnline);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected && !!state.isInternetReachable);
    });
    return () => unsubscribe();
  }, [setIsOnline]);
}
