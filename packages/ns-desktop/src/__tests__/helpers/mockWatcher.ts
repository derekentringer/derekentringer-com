/**
 * Programmatic stand-in for @tauri-apps/plugin-fs's watch().
 *
 * The real `watch` relies on a Tauri runtime + platform FS events, so
 * tests can't observe it deterministically. This mock keeps the same
 * signature but surfaces a manual `emit()` so tests drive events
 * explicitly:
 *
 *   // test setup
 *   const watcher = new MockWatcher();
 *   vi.mock("@tauri-apps/plugin-fs", async (actual) => ({
 *     ...(await actual<object>()),
 *     watch: watcher.bind(),
 *   }));
 *
 *   // in test
 *   await watcher.emit("/tmp/foo");  // fires any registered callback
 *
 * Covers what the real API does in production:
 *   - per-path registration (recursive: false)
 *   - recursive registration (matches any descendant path)
 *   - unsubscribe via returned cleanup fn
 */

export type WatchEvent = { paths: string[]; type?: string };
export type WatchCallback = (event: WatchEvent) => void | Promise<void>;
type Unwatch = () => void;

interface Registration {
  path: string;
  callback: WatchCallback;
  recursive: boolean;
}

export interface MockWatchOptions {
  recursive?: boolean;
}

export class MockWatcher {
  private registrations = new Set<Registration>();

  /** The bound watch function to pass into vi.mock(). */
  bind(): (
    path: string,
    callback: WatchCallback,
    options?: MockWatchOptions,
  ) => Promise<Unwatch> {
    return async (path, callback, options) => {
      const reg: Registration = {
        path,
        callback,
        recursive: options?.recursive ?? false,
      };
      this.registrations.add(reg);
      return () => {
        this.registrations.delete(reg);
      };
    };
  }

  /**
   * Fire a synthetic event for one or more paths. Invokes any
   * registration whose `path` matches exactly, or whose `path` is an
   * ancestor and is recursive.
   */
  async emit(path: string | string[], type = "modify"): Promise<void> {
    const paths = Array.isArray(path) ? path : [path];
    for (const p of paths) {
      for (const reg of this.registrations) {
        if (this.matches(reg, p)) {
          await reg.callback({ paths: [p], type });
        }
      }
    }
  }

  /** Returns the count of currently active registrations. */
  registrationCount(): number {
    return this.registrations.size;
  }

  /** Clear all registrations. Call in afterEach if you reuse a single instance. */
  reset(): void {
    this.registrations.clear();
  }

  private matches(reg: Registration, eventPath: string): boolean {
    if (reg.path === eventPath) return true;
    if (!reg.recursive) return false;
    const prefix = reg.path.endsWith("/") ? reg.path : reg.path + "/";
    return eventPath.startsWith(prefix);
  }
}
