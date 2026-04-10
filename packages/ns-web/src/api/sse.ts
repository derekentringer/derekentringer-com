import { getAccessToken, refreshAccessToken, tokenManager } from "./client.ts";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3004";

const MIN_RECONNECT_MS = 30_000;

interface SseConnection {
  disconnect: () => void;
}

export function connectSseStream(
  onEvent: () => void,
  onError?: () => void,
  onConnect?: () => void,
  onChatEvent?: () => void,
): SseConnection {
  const deviceId = crypto.randomUUID();
  let abortController: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let backoffMs = 1000;
  let disconnected = false;

  function clearTimers() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function scheduleReconnect() {
    if (disconnected) return;
    clearTimers();
    reconnectTimer = setTimeout(() => {
      if (!disconnected) connect();
    }, backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30_000);
  }

  /** Compute dynamic reconnect delay based on token expiry, with jitter */
  function computeRefreshDelay(): number {
    const msUntilExpiry = tokenManager.getMsUntilExpiry();
    // Reconnect 2 minutes before expiry, minimum 30 seconds
    const baseMs = msUntilExpiry
      ? Math.max(msUntilExpiry - 120_000, MIN_RECONNECT_MS)
      : 13 * 60 * 1000; // fallback if no expiry info
    // Add 10% jitter to avoid thundering herd
    const jitter = Math.floor(Math.random() * baseMs * 0.1);
    return baseMs + jitter;
  }

  async function connect() {
    if (disconnected) return;

    let token = getAccessToken();
    if (!token) {
      scheduleReconnect();
      return;
    }

    // Check if token is about to expire (within 60s) and refresh proactively
    const msUntilExpiry = tokenManager.getMsUntilExpiry();
    if (msUntilExpiry !== null && msUntilExpiry < 60_000) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        token = newToken;
      } else {
        scheduleReconnect();
        return;
      }
    }

    abortController = new AbortController();

    try {
      const response = await fetch(
        `${BASE_URL}/sync/events?deviceId=${deviceId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortController.signal,
          credentials: "include",
        },
      );

      if (!response.ok || !response.body) {
        // Distinguish auth errors from transient failures
        if (response.status === 403) {
          // Forbidden — stop retrying (permissions revoked)
          onError?.();
          return;
        }
        if (response.status === 401) {
          // Try refresh and retry once
          const newToken = await refreshAccessToken();
          if (newToken) {
            backoffMs = 1000;
            connect();
            return;
          }
          onError?.();
          return;
        }
        onError?.();
        scheduleReconnect();
        return;
      }

      // Reset backoff on successful connection
      backoffMs = 1000;
      onConnect?.();

      // Schedule proactive reconnect before JWT expiry (dynamic timer + jitter)
      refreshTimer = setTimeout(() => {
        if (!disconnected) {
          abortController?.abort();
          connect();
        }
      }, computeRefreshDelay());

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep incomplete last line in buffer
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            if (currentEvent === "sync") {
              onEvent();
            } else if (currentEvent === "chat") {
              onChatEvent?.();
            }
            currentEvent = "";
          } else if (line === "") {
            currentEvent = "";
          }
        }
      }
    } catch (err: unknown) {
      // AbortError is expected on disconnect
      if (err instanceof DOMException && err.name === "AbortError") return;
      onError?.();
    }

    // Stream ended — reconnect unless manually disconnected
    if (!disconnected) {
      scheduleReconnect();
    }
  }

  function handleVisibility() {
    if (document.hidden) {
      // Tab went to background — disconnect to save resources
      abortController?.abort();
      clearTimers();
    } else {
      // Tab came back — reconnect + reload data
      backoffMs = 1000;
      connect();
      onEvent(); // Catch up on missed changes
    }
  }

  document.addEventListener("visibilitychange", handleVisibility);

  // Start initial connection
  connect();

  return {
    disconnect() {
      disconnected = true;
      clearTimers();
      abortController?.abort();
      document.removeEventListener("visibilitychange", handleVisibility);
    },
  };
}
