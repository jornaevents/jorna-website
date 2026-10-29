"use client";

// Web push via Firebase Cloud Messaging (FCM for Web). A browser gets an FCM
// registration token — the same string shape as a native device token — which
// we register with the backend (platform:"web"). Dispatch then treats a browser
// as just another of the user's devices (see send_push_to_user server-side).
//
// The heavy firebase SDK is imported lazily so it never lands in the initial
// bundle for the many users who never turn notifications on.

import { firebaseConfig, VAPID_PUBLIC_KEY, firebasePushConfigured } from "./firebaseConfig";
import { apiFetch } from "./api";
import { PUSH_ENABLED } from "./flags";

/**
 * The app this page belongs to: "/app/" (vendor) or "/client/" (client) —
 * both served from jornaevents.com since 2026-10-29, each with its own
 * service worker under its own path. Read from the page rather than passed
 * in, so the shared code needs no per-app wiring.
 */
function appBase(): string {
  const first = typeof window === "undefined" ? "" : window.location.pathname.split("/")[1];
  return first === "client" ? "/client/" : "/app/";
}

const swUrl = () => `${appBase()}firebase-messaging-sw.js`;

/** One token per app on a shared origin. The vendor app keeps the original
 *  key, so a browser registered before the move can still unregister. */
const localTokenKey = () => (appBase() === "/app/" ? "jorna_push_token" : `jorna_push_token:${appBase()}`);

export type PermissionState = NotificationPermission | "unsupported";

// Why push isn't available — so the UI can explain instead of vanishing.
//   off             — switched off for this build (PUSH_ENABLED); not user-facing
//   unconfigured    — Firebase values not filled in (dev only; not user-facing)
//   insecure        — not an https / secure context
//   ios-add-to-home — iOS, but not launched from a Home Screen install (16.4+)
//   unsupported     — browser lacks the APIs / FCM isn't supported here
export type PushAvailability =
  | { ok: true }
  | { ok: false; reason: "off" | "unconfigured" | "insecure" | "ios-add-to-home" | "unsupported" };

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPhone/iPod report plainly; iPadOS 13+ masquerades as a Mac with touch.
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return window.matchMedia?.("(display-mode: standalone)").matches || iosStandalone;
}

/** Whether this browser can do web push right now, and if not, why. */
export async function pushAvailability(): Promise<PushAvailability> {
  if (!PUSH_ENABLED) return { ok: false, reason: "off" };
  if (!firebasePushConfigured) return { ok: false, reason: "unconfigured" };
  if (typeof window === "undefined") return { ok: false, reason: "unsupported" };
  if (!window.isSecureContext) return { ok: false, reason: "insecure" };

  const hasApis =
    "serviceWorker" in navigator && "Notification" in window && "PushManager" in window;
  if (hasApis) {
    try {
      const { isSupported } = await import("firebase/messaging");
      if (await isSupported()) return { ok: true };
    } catch {
      /* fall through to the reasons below */
    }
  }
  // On iOS the push APIs are absent unless the site was installed to the Home
  // Screen and opened from there — the most common "nothing showed up" cause.
  if (isIOS() && !isStandalone()) return { ok: false, reason: "ios-add-to-home" };
  return { ok: false, reason: "unsupported" };
}

/** Can this browser do web push at all, and is Firebase configured? */
export async function pushSupported(): Promise<boolean> {
  return (await pushAvailability()).ok;
}

export function permissionState(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

async function messagingInstance() {
  const { initializeApp, getApps, getApp } = await import("firebase/app");
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const { getMessaging } = await import("firebase/messaging");
  return getMessaging(app);
}

/**
 * Ask permission, get an FCM token for this browser, and register it with the
 * backend. Returns the token, or null if unsupported / permission not granted.
 * Safe to call again — it refreshes the token and re-registers.
 */
export async function enableWebPush(): Promise<string | null> {
  if (!(await pushSupported())) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  // Register our SW explicitly. FCM would otherwise look for it at the origin
  // root (/firebase-messaging-sw.js), which 404s under the apps' base paths.
  const registration = await navigator.serviceWorker.register(swUrl(), { scope: appBase() });

  const { getToken } = await import("firebase/messaging");
  const token = await getToken(await messagingInstance(), {
    vapidKey: VAPID_PUBLIC_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return null;

  await apiFetch("/notifications/register-token", {
    method: "POST",
    body: { fcm_token: token, platform: "web" },
  });
  try {
    localStorage.setItem(localTokenKey(), token);
  } catch {
    /* private mode — non-fatal; sign-out just can't target this exact token */
  }
  return token;
}

/**
 * Foreground messages: FCM shows nothing while the tab is focused, so surface
 * them ourselves as a native notification via the SW registration. Returns an
 * unsubscribe function.
 */
export async function listenForeground(): Promise<() => void> {
  if (!(await pushSupported()) || permissionState() !== "granted") return () => {};
  const { onMessage } = await import("firebase/messaging");
  const messaging = await messagingInstance();
  const registration = await navigator.serviceWorker.getRegistration(appBase());
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? "Jorna";
    const body = payload.notification?.body ?? "";
    registration?.showNotification(title, { body, icon: `${appBase()}favicon.ico`, data: payload.data });
  });
}

/**
 * Remove this browser's token on sign-out, so a shared computer stops pinging
 * the previous user. Best-effort, and must run while still authenticated (the
 * DELETE needs the bearer token), so call it before clearing the session.
 */
export async function disableWebPushForThisDevice(userId: string): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(localTokenKey());
  } catch {
    /* ignore */
  }
  if (token) {
    try {
      await apiFetch(`/notifications/remove-token/${userId}?token=${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
    } catch {
      /* best-effort; the backend also prunes tokens FCM reports as dead */
    }
    try {
      localStorage.removeItem(localTokenKey());
    } catch {
      /* ignore */
    }
  }
}
