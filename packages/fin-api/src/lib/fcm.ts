import admin from "firebase-admin";
import { loadConfig } from "../config.js";
import { decryptField } from "./encryption.js";
import {
  getAllEncryptedTokens,
  removeDeviceTokenByEncryptedToken,
  updateNotificationLogFcmId,
} from "../store/notificationStore.js";

interface FcmPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface FcmSendResult {
  sent: boolean;
  messageId: string | null;
  error: string | null;
}

let isInitialized = false;

function initializeFirebase(): boolean {
  if (isInitialized) return true;

  const config = loadConfig();
  const projectId = config.fcmProjectId;
  const clientEmail = config.fcmClientEmail;
  const privateKey = config.fcmPrivateKey;

  if (!projectId || !clientEmail || !privateKey) {
    return false;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
    isInitialized = true;
    return true;
  } catch (e) {
    console.error("[FCM] Failed to initialize Firebase:", e instanceof Error ? e.message : "unknown error");
    return false;
  }
}

/**
 * Send a push notification to all registered mobile devices.
 * Auto-removes invalid/expired tokens.
 * Web notifications are handled by polling, not push.
 */
export async function sendToAllDevices(
  payload: FcmPayload,
  notificationLogId?: string,
): Promise<FcmSendResult> {
  if (!initializeFirebase()) {
    return { sent: false, messageId: null, error: "FCM not configured" };
  }

  const tokens = await getAllEncryptedTokens();
  if (tokens.length === 0) {
    return { sent: false, messageId: null, error: "No registered device tokens" };
  }

  // Decrypt all tokens
  const fcmTokens: string[] = [];
  for (const { token: encryptedToken } of tokens) {
    try {
      fcmTokens.push(decryptField(encryptedToken));
    } catch {
      await removeDeviceTokenByEncryptedToken(encryptedToken);
    }
  }

  if (fcmTokens.length === 0) {
    return { sent: false, messageId: null, error: "No valid device tokens" };
  }

  try {
    const message: admin.messaging.MulticastMessage = {
      tokens: fcmTokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data ?? {},
      android: {
        priority: "high",
        notification: {
          channelId: "finance_notifications",
          priority: "high",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: payload.title,
              body: payload.body,
            },
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // Clean up invalid tokens
    let firstMessageId: string | null = null;
    response.responses.forEach((resp, idx) => {
      if (resp.success && resp.messageId) {
        if (!firstMessageId) firstMessageId = resp.messageId;
      } else if (resp.error) {
        const code = resp.error.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/invalid-argument"
        ) {
          // Remove the encrypted token that corresponds to this fcmToken
          const encToken = tokens.find((t) => {
            try { return decryptField(t.token) === fcmTokens[idx]; } catch { return false; }
          });
          if (encToken) {
            removeDeviceTokenByEncryptedToken(encToken.token);
          }
        }
      }
    });

    if (notificationLogId && firstMessageId) {
      await updateNotificationLogFcmId(notificationLogId, firstMessageId);
    }

    if (response.successCount > 0 && firstMessageId) {
      return { sent: true, messageId: firstMessageId, error: null };
    }

    const errors = response.responses
      .filter((r) => r.error)
      .map((r) => r.error?.message ?? "unknown")
      .join("; ");
    return { sent: false, messageId: null, error: errors || "All sends failed" };
  } catch (e) {
    return {
      sent: false,
      messageId: null,
      error: `FCM send error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
