"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getAuthRedirectUrl, getSupabaseClient } from "@/lib/supabase";
import { completeAuthFromUrl } from "@/lib/auth-link";

/**
 * Authentication for the optional cloud backup.
 *
 * Everything here is additive: when Supabase is not configured, or the user
 * never signs in, the app keeps working exactly as the offline-only build.
 *
 * The session is persisted in localStorage and auto-refreshed, so the user
 * stays signed in until they explicitly sign out.
 *
 * One mail offers two ways in: tapping the link, or typing the six digit code.
 * The code is the reliable one on a phone, because reading the mail can send
 * the link into a different browser than the PWA it was requested from.
 */

export type AuthProvider = "google" | "github";

/**
 * A login waiting for its code. Kept in localStorage because switching to the
 * mail app can evict the PWA from memory; without this the input field - and
 * the address it belongs to - would be gone on return.
 */
const pendingLoginKey = "momentum-auth:pending-email:v1";
/** Matches the Supabase default token lifetime. */
const pendingLoginTtlMs = 60 * 60 * 1000;

export type PendingLogin = { email: string; requestedAt: number };

function readPendingLogin(): PendingLogin | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(pendingLoginKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PendingLogin;
    if (!parsed?.email || Date.now() - parsed.requestedAt > pendingLoginTtlMs) {
      window.localStorage.removeItem(pendingLoginKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePendingLogin(value: PendingLogin | null) {
  try {
    if (value) {
      window.localStorage.setItem(pendingLoginKey, JSON.stringify(value));
    } else {
      window.localStorage.removeItem(pendingLoginKey);
    }
  } catch {
    // Storage unavailable: the field simply will not survive a restart.
  }
}

/** Keeps digits only, so a pasted "123 456" or "Code: 123456" still works. */
export function sanitizeOtpCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export type AuthState = {
  configured: boolean;
  client: SupabaseClient | null;
  session: Session | null;
  /** True until the initial session lookup has finished. */
  loading: boolean;
  email: string | null;
  userId: string | null;
  /** Set while a mail has been sent and its code has not been used yet. */
  pendingLogin: PendingLogin | null;
  /** Result of a login link that was opened, shown once on return. */
  linkMessage: { tone: "ok" | "error"; text: string } | null;
  clearLinkMessage: () => void;
};

export type AuthActions = {
  /** Sends a mail containing both a magic link and a 6-digit code. */
  sendEmailCode: (email: string) => Promise<{ ok: boolean; message: string }>;
  /** Completes the login with the code from that mail. */
  verifyEmailCode: (email: string, code: string) => Promise<{ ok: boolean; message: string }>;
  cancelPendingLogin: () => void;
  signInWithProvider: (provider: AuthProvider) => Promise<{ ok: boolean; message: string }>;
  signOut: () => Promise<{ ok: boolean; message: string }>;
};

export function useAuth(): AuthState & AuthActions {
  const client = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  // Starts false when there is no client, so no effect-time reset is needed.
  const [loading, setLoading] = useState(Boolean(client));
  const [pendingLogin, setPendingLogin] = useState<PendingLogin | null>(null);
  const [linkMessage, setLinkMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (!client) {
      return;
    }

    let active = true;

    // Redeem a login link before looking at the stored session: the link is the
    // more recent intent, and its token must be consumed exactly once.
    void (async () => {
      const result = await completeAuthFromUrl(client);
      if (!active) {
        return;
      }
      if (result.status === "ok") {
        setLinkMessage({ tone: "ok", text: result.message });
        writePendingLogin(null);
        setPendingLogin(null);
      } else if (result.status === "error") {
        setLinkMessage({ tone: "error", text: result.message });
        setPendingLogin(readPendingLogin());
      } else {
        setPendingLogin(readPendingLogin());
      }

      const { data } = await client.auth.getSession();
      if (!active) {
        return;
      }
      setSession(data.session ?? null);
      setLoading(false);
    })();

    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
      if (next) {
        writePendingLogin(null);
        setPendingLogin(null);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [client]);

  const sendEmailCode = useCallback(
    async (email: string) => {
      if (!client) {
        return { ok: false, message: "Cloud ist nicht konfiguriert." };
      }
      const trimmed = email.trim();
      if (!trimmed) {
        return { ok: false, message: "Bitte eine E-Mail-Adresse eingeben." };
      }
      const { error } = await client.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: getAuthRedirectUrl(), shouldCreateUser: true },
      });
      if (error) {
        return { ok: false, message: error.message };
      }
      const next = { email: trimmed, requestedAt: Date.now() };
      writePendingLogin(next);
      setPendingLogin(next);
      return {
        ok: true,
        message: "Mail gesendet. Entweder den Link antippen oder den Code hier eintragen.",
      };
    },
    [client],
  );

  const verifyEmailCode = useCallback(
    async (email: string, code: string) => {
      if (!client) {
        return { ok: false, message: "Cloud ist nicht konfiguriert." };
      }
      const trimmedCode = sanitizeOtpCode(code);
      if (trimmedCode.length !== 6) {
        return { ok: false, message: "Bitte den 6-stelligen Code aus der Mail eintragen." };
      }
      const address = email.trim();

      // A first-time address is confirmed with a signup token, an existing one
      // with an email token. The code looks identical, so try both.
      const { error } = await client.auth.verifyOtp({
        email: address,
        token: trimmedCode,
        type: "email",
      });
      if (!error) {
        writePendingLogin(null);
        setPendingLogin(null);
        return { ok: true, message: "Angemeldet." };
      }

      const retry = await client.auth.verifyOtp({
        email: address,
        token: trimmedCode,
        type: "signup",
      });
      if (retry.error) {
        const text = retry.error.message.toLowerCase();
        if (text.includes("expired") || text.includes("invalid")) {
          return {
            ok: false,
            message: "Code ist falsch oder abgelaufen. Fordere eine neue Mail an.",
          };
        }
        return { ok: false, message: retry.error.message };
      }
      writePendingLogin(null);
      setPendingLogin(null);
      return { ok: true, message: "Angemeldet." };
    },
    [client],
  );

  const cancelPendingLogin = useCallback(() => {
    writePendingLogin(null);
    setPendingLogin(null);
  }, []);

  const clearLinkMessage = useCallback(() => setLinkMessage(null), []);

  const signInWithProvider = useCallback(
    async (provider: AuthProvider) => {
      if (!client) {
        return { ok: false, message: "Cloud ist nicht konfiguriert." };
      }
      const { error } = await client.auth.signInWithOAuth({
        provider,
        options: { redirectTo: getAuthRedirectUrl() },
      });
      if (error) {
        return { ok: false, message: error.message };
      }
      // The browser navigates away to the provider at this point.
      return { ok: true, message: "Weiterleitung ..." };
    },
    [client],
  );

  const signOut = useCallback(async () => {
    if (!client) {
      return { ok: false, message: "Cloud ist nicht konfiguriert." };
    }
    const { error } = await client.auth.signOut();
    if (error) {
      return { ok: false, message: error.message };
    }
    writePendingLogin(null);
    setPendingLogin(null);
    return { ok: true, message: "Abgemeldet. Deine Daten bleiben lokal erhalten." };
  }, [client]);

  return {
    configured: Boolean(client),
    client,
    session,
    loading,
    email: session?.user.email ?? null,
    userId: session?.user.id ?? null,
    pendingLogin,
    linkMessage,
    clearLinkMessage,
    sendEmailCode,
    verifyEmailCode,
    cancelPendingLogin,
    signInWithProvider,
    signOut,
  };
}
