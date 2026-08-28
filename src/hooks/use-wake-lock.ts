"use client";

import { useCallback, useEffect, useRef } from "react";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

/**
 * Keeps the screen awake while a workout is running.
 * iOS releases the sentinel whenever the tab is hidden, so it is re-acquired
 * on every visibilitychange back to visible.
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const request = useCallback(async () => {
    if (typeof navigator === "undefined") {
      return;
    }
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock || sentinelRef.current) {
      return;
    }
    try {
      const sentinel = await wakeLock.request("screen");
      sentinelRef.current = sentinel;
      sentinel.addEventListener("release", () => {
        sentinelRef.current = null;
      });
    } catch {
      // Denied (e.g. low battery) - degrade silently.
    }
  }, []);

  const release = useCallback(async () => {
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    if (!sentinel || sentinel.released) {
      return;
    }
    try {
      await sentinel.release();
    } catch {
      // already released
    }
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (activeRef.current && document.visibilityState === "visible") {
        void request();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [request]);

  useEffect(() => {
    if (active) {
      void request();
    } else {
      void release();
    }
  }, [active, release, request]);

  useEffect(() => {
    return () => {
      void release();
    };
  }, [release]);
}

export function isWakeLockSupported() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}
