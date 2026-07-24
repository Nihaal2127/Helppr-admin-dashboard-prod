import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
} from "firebase/messaging";
import { showLog } from "../helper/utility";
import { storeForegroundNotification } from "./notificationService";

const firebaseConfig = {
  apiKey: "AIzaSyDbvu_VONThJcXYYp_ikMY4_qyXPUVScbE",
  authDomain: "helppr-bc0ba.firebaseapp.com",
  projectId: "helppr-bc0ba",
  messagingSenderId: "944474510158",
  appId: "1:944474510158:web:14d411b2c94fc9c8d7041f",
};

const firebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

type MessagingInstance = ReturnType<typeof getMessaging>;

let messagingInstance: MessagingInstance | null = null;
let messagingInitPromise: Promise<MessagingInstance | null> | null = null;
let foregroundMessageListenerAttached = false;
let permissionRequestInFlight: Promise<string | void> | null = null;

/**
 * Firebase Messaging must not be initialized at module load: unsupported browsers
 * throw (e.g. messaging/unsupported-browser) and break the whole app (React #311).
 */
async function getMessagingWhenSupported(): Promise<MessagingInstance | null> {
  if (typeof window === "undefined") {
    return null;
  }
  if (messagingInstance) {
    return messagingInstance;
  }
  if (!messagingInitPromise) {
    messagingInitPromise = (async () => {
      try {
        if (!(await isSupported())) {
          showLog(
            "Firebase Messaging: unsupported in this browser/environment."
          );
          return null;
        }
        messagingInstance = getMessaging(firebaseApp);
        return messagingInstance;
      } catch (err) {
        showLog("Firebase Messaging init failed:", err);
        return null;
      }
    })();
  }
  return messagingInitPromise;
}

const FIREBASE_MESSAGING_SW = "/firebase-messaging-sw.js";

async function waitForServiceWorkerActivation(
  registration: ServiceWorkerRegistration
): Promise<ServiceWorkerRegistration> {
  if (registration.active) {
    return registration;
  }

  const worker = registration.installing ?? registration.waiting;
  if (worker) {
    await new Promise<void>((resolve, reject) => {
      const onStateChange = () => {
        if (worker.state === "activated") {
          worker.removeEventListener("statechange", onStateChange);
          resolve();
        } else if (worker.state === "redundant") {
          worker.removeEventListener("statechange", onStateChange);
          reject(
            new Error("Firebase messaging service worker failed to activate")
          );
        }
      };
      worker.addEventListener("statechange", onStateChange);
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", onStateChange);
        resolve();
      }
    });
    return registration;
  }

  await navigator.serviceWorker.ready;
  return registration;
}

async function registerFirebaseMessagingServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(
    FIREBASE_MESSAGING_SW
  );
  return waitForServiceWorkerActivation(registration);
}

function attachForegroundMessageListener(messaging: MessagingInstance): void {
  if (foregroundMessageListenerAttached) return;
  foregroundMessageListenerAttached = true;
  onMessage(messaging, (payload) => {
    storeForegroundNotification(payload);
    const { title, body } = payload?.notification || {};
    if (Notification.permission === "granted") {
      new Notification(title || "Notification", {
        body: body || "",
        icon: "/notification/icon-192x192.png",
      });
      const notificationAudio = new Audio("/notification/notify.wav");
      notificationAudio.load();
      notificationAudio
        .play()
        .then(() => {
          notificationAudio?.pause();
          notificationAudio.currentTime = 0;
          showLog("✅ Notification sound unlocked");
        })
        .catch((err) => {
          showLog("⚠️ Failed to unlock audio:", err);
        });
    } else {
      showLog("Foreground Notification permission not granted");
    }
  });
}

async function registerMessagingToken(
  messaging: MessagingInstance
): Promise<string | void> {
  try {
    const swReg = await registerFirebaseMessagingServiceWorker();
    const token = await getToken(messaging, {
      vapidKey:
        "BLxRotJ_pgm3JdzjDifCxSCabbm9S70cUuUasqpfSO0Ib6wBoaAJQ7gBdrdQkwwmK3V1IEMbUidJUvRXZWqNMbk",
      serviceWorkerRegistration: swReg,
    });
    showLog("FCM Token:", token);
    attachForegroundMessageListener(messaging);
    return token;
  } catch (err) {
    showLog("Failed to register FCM token:", err);
  }
}

export const requestPermission = async () => {
  if (permissionRequestInFlight) {
    return permissionRequestInFlight;
  }

  permissionRequestInFlight = (async () => {
    try {
      const messaging = await getMessagingWhenSupported();
      if (!messaging) {
        return;
      }

      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        showLog("Notifications or Service Worker API not available.");
        return;
      }

      const existing = Notification.permission;
      if (existing === "denied") {
        showLog("Notification permission denied.");
        return;
      }

      const permission =
        existing === "granted"
          ? "granted"
          : await Notification.requestPermission();

      if (permission === "granted") {
        return registerMessagingToken(messaging);
      }
      showLog("Notification permission not granted.");
    } catch (err) {
      showLog("Error getting FCM token:", err);
    }
  })();

  try {
    return await permissionRequestInFlight;
  } finally {
    permissionRequestInFlight = null;
  }
};

/** @deprecated Use internal listener via `requestPermission`; kept for API compatibility. */
export const onMessageListener = (messaging: MessagingInstance) => {
  attachForegroundMessageListener(messaging);
  return Promise.resolve(null);
};
