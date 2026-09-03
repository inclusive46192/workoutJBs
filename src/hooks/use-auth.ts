"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getAuthRedirectUrl, getSupabaseClient } from "@/lib/supabase";

/**
 * Authentication for the optional cloud backup.
 *
 * Everything here is additive: when Supabase is not configured, or the user
 * never signs in, the app keeps working exactly as the offline-only build.
 *
 * The session is persisted in localStorage and auto-refreshed, so the user
 * stays signed in until they explicitly sign out.
 */

export type AuthProvider = "google" | "github";

export type AuthState = {
  configured: boolean;
  client: SupabaseClient | null;
  session: Session | null;
  /** True until the initial session lookup has finished. */
  loading: boolean;
  email: string | null;
  userId: string | null;
};

export type AuthActions = {
  /** Sends a mail containing both a magic link and a 6-digit code. */
  sendEmailCode: (email: string) => Promise<{ ok: boolean; message: string }>;
  /** Completes the login with the code from that mail. */
  verifyEmailCode: (email: string, code: string) => Promise<{ ok: boolean; message: string }>;
  signInWithProvider: (provider: AuthProvider) => Promise<{ ok: boolean; message: string }>;
  signOut: () => Promise<{ ok: boolean; message: string }>;
};

export function useAuth(): AuthState & AuthActions {
  const client = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  // Starts false when there is no client, so no effect-time reset is needed.
  const [loading, setLoading] = useState(Boolean(client));

  useEffect(() => {
    if (!client) {
      return;
    }

    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
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
      const trimmedCode = code.trim();
      if (!trimmedCode) {
        return { ok: false, message: "Bitte den Code aus der Mail eintragen." };
      }
      const { error } = await client.auth.verifyOtp({
        email: email.trim(),
        token: trimmedCode,
        type: "email",
      });
      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true, message: "Angemeldet." };
    },
    [client],
  );

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
    return { ok: true, message: "Abgemeldet. Deine Daten bleiben lokal erhalten." };
  }, [client]);

  return {
    configured: Boolean(client),
    client,
    session,
    loading,
    email: session?.user.email ?? null,
    userId: session?.user.id ?? null,
    sendEmailCode,
    verifyEmailCode,
    signInWithProvider,
    signOut,
  };
}
