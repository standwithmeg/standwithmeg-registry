"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "swm-install-banner-dismissed";

function IconX({ size = 18, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function IconShare({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" x2="12" y1="2" y2="15" />
    </svg>
  );
}

function IconDownload({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

function isIOSSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/(chrome|crios|crmo)/.test(ua);
  return isIOS && isSafari;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function useMounted() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallBanner() {
  const mounted = useMounted();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  }

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") {
      setDismissed(true);
    }
    setPromptEvent(null);
  }

  if (!mounted || dismissed || isStandalone()) return null;

  const ios = isIOSSafari();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t px-4 py-3 shadow-lg"
      style={{
        backgroundColor: "#0A1A2B",
        borderColor: "rgba(201,162,39,0.30)",
        color: "#F5F2EB",
      }}
      role="banner"
      aria-label="Install app"
    >
      <div className="mx-auto flex max-w-5xl items-start gap-3">
        <div className="mt-0.5 shrink-0" style={{ color: "#C9A326" }}>
          {ios ? <IconShare size={20} /> : <IconDownload size={20} />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: "#F5F2EB" }}>
            Add Connection Circles to your home screen
          </p>
          {ios ? (
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "rgba(245,242,235,0.70)" }}>
              Tap <span className="font-bold" style={{ color: "#C9A326" }}>Share</span>, then{" "}
              <span className="font-bold" style={{ color: "#C9A326" }}>Add to Home Screen</span> to install.
            </p>
          ) : promptEvent ? (
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "rgba(245,242,235,0.70)" }}>
              Install this app for quick access to your Circle.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "rgba(245,242,235,0.70)" }}>
              Use your browser&apos;s menu to add this site to your home screen.
            </p>
          )}
          {!ios && promptEvent && (
            <button
              type="button"
              onClick={install}
              className="mt-2 rounded-md px-3 py-1.5 text-xs font-black"
              style={{ backgroundColor: "#C73D2E", color: "white" }}
            >
              Install app
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md p-1"
          aria-label="Dismiss install banner"
        >
          <IconX size={18} style={{ color: "rgba(245,242,235,0.70)" }} />
        </button>
      </div>
    </div>
  );
}
