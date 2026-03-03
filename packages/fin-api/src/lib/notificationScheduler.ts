import type { FastifyBaseLogger } from "fastify";
import { evaluateAllNotifications } from "./notificationEvaluator.js";
import { createNotificationLog } from "../store/notificationStore.js";
import { sendToAllDevices } from "./fcm.js";

const SCHEDULER_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let logger: FastifyBaseLogger | null = null;

/** Volatile flag — set during imports to prevent evaluating partial data */
let _isImporting = false;

export function setImporting(value: boolean): void {
  _isImporting = value;
}

export function isImporting(): boolean {
  return _isImporting;
}

async function runEvaluationCycle(): Promise<void> {
  if (_isImporting) {
    logger?.info("Notification scheduler: skipping cycle (import in progress)");
    return;
  }

  try {
    const pending = await evaluateAllNotifications();

    if (pending.length === 0) {
      logger?.debug("Notification scheduler: no pending notifications");
      return;
    }

    logger?.info(
      `Notification scheduler: ${pending.length} pending notification(s) to send`,
    );

    for (const notification of pending) {
      // Write log entry BEFORE sending (dedupe-first strategy)
      const logEntry = await createNotificationLog({
        type: notification.type,
        title: notification.title,
        body: notification.body,
        dedupeKey: notification.dedupeKey,
        metadata: notification.metadata,
      });

      // If logEntry is null, dedupe key already exists (benign during rolling deploys)
      if (!logEntry) continue;

      // Send via FCM
      await sendToAllDevices(
        {
          title: notification.title,
          body: notification.body,
          data: {
            route: notification.route ?? "/",
            notificationId: logEntry.id,
            type: notification.type,
          },
        },
        logEntry.id,
      );
    }
  } catch (e) {
    logger?.error(e, "Notification scheduler: evaluation cycle failed");
  }
}

export function startNotificationScheduler(log: FastifyBaseLogger): void {
  logger = log;

  // Run an initial evaluation shortly after startup (30s delay)
  setTimeout(() => {
    runEvaluationCycle().catch((e) => {
      logger?.error(e, "Notification scheduler: initial evaluation failed");
    });
  }, 30_000);

  schedulerTimer = setInterval(() => {
    runEvaluationCycle().catch((e) => {
      logger?.error(e, "Notification scheduler: scheduled evaluation failed");
    });
  }, SCHEDULER_INTERVAL_MS);

  logger.info(
    `Notification scheduler started (interval: ${SCHEDULER_INTERVAL_MS / 1000}s)`,
  );
}

export function stopNotificationScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  logger?.info("Notification scheduler stopped");
}
