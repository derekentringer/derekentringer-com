import { PassThrough } from "node:stream";

interface SseConnection {
  stream: PassThrough;
  deviceId: string;
  lastWrite: number;
}

export interface SseHub {
  addConnection(userId: string, deviceId: string, stream: PassThrough): void;
  removeConnection(userId: string, stream: PassThrough): void;
  notify(userId: string, excludeDeviceId?: string): void;
  cleanup(): void;
  /** Visible for testing */
  connectionCount(userId?: string): number;
}

export function createSseHub(): SseHub {
  const connections = new Map<string, Set<SseConnection>>();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let beatCount = 0;

  function sweepDead() {
    const now = Date.now();
    const staleThreshold = 90_000; // 90s
    for (const [userId, conns] of connections) {
      for (const conn of conns) {
        if (now - conn.lastWrite > staleThreshold) {
          conn.stream.end();
          conns.delete(conn);
        }
      }
      if (conns.size === 0) connections.delete(userId);
    }
  }

  function heartbeat() {
    beatCount++;
    for (const [userId, conns] of connections) {
      for (const conn of conns) {
        try {
          conn.stream.write(":\n\n");
          conn.lastWrite = Date.now();
        } catch {
          conn.stream.end();
          conns.delete(conn);
        }
      }
      if (conns.size === 0) connections.delete(userId);
    }
    // Sweep dead connections every other heartbeat (60s cycle)
    if (beatCount % 2 === 0) {
      sweepDead();
    }
  }

  // Start heartbeat interval
  heartbeatTimer = setInterval(heartbeat, 30_000);
  // Allow the timer to not prevent Node from exiting
  if (heartbeatTimer.unref) heartbeatTimer.unref();

  return {
    addConnection(userId: string, deviceId: string, stream: PassThrough) {
      let userConns = connections.get(userId);
      if (!userConns) {
        userConns = new Set();
        connections.set(userId, userConns);
      }
      userConns.add({ stream, deviceId, lastWrite: Date.now() });
    },

    removeConnection(userId: string, stream: PassThrough) {
      const userConns = connections.get(userId);
      if (!userConns) return;
      for (const conn of userConns) {
        if (conn.stream === stream) {
          userConns.delete(conn);
          break;
        }
      }
      if (userConns.size === 0) connections.delete(userId);
    },

    notify(userId: string, excludeDeviceId?: string) {
      const userConns = connections.get(userId);
      if (!userConns) return;
      for (const conn of userConns) {
        if (excludeDeviceId && conn.deviceId === excludeDeviceId) continue;
        try {
          conn.stream.write("event: sync\ndata: {}\n\n");
          conn.lastWrite = Date.now();
        } catch {
          // Stream errored — will be cleaned up by sweepDead
        }
      }
    },

    cleanup() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      for (const [, conns] of connections) {
        for (const conn of conns) {
          try {
            conn.stream.end();
          } catch {
            // ignore
          }
        }
      }
      connections.clear();
    },

    connectionCount(userId?: string): number {
      if (userId) {
        return connections.get(userId)?.size ?? 0;
      }
      let total = 0;
      for (const [, conns] of connections) {
        total += conns.size;
      }
      return total;
    },
  };
}
