import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client.
 *
 * Returns null when the environment variables are absent, which is the normal
 * case for the purely offline build. Every caller must handle null: the app is
 * fully usable logged out, and nothing in the workout flow may depend on the
 * network.
 *
 * Session handling is tuned for a personal PWA:
 * - persistSession + localStorage  -> stays logged in until explicit logout
 * - autoRefreshToken               -> survives long gaps between sessions
 * - detectSessionInUrl             -> completes magic-link / OAuth redirects
 */

let cached: SupabaseClient | null = null;
let initialised = false;

export function getSupabaseClient(): SupabaseClient | null {
  if (initialised) {
    return cached;
  }
  initialised = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || typeof window === "undefined") {
    cached = null;
    return cached;
  }

  cached = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      storageKey: "momentum-auth:v1",
    },
  });
  return cached;
}

export function isCloudConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Where the provider should send the user back to. Uses the current origin so
 * the same build works on localhost and on the deployed Vercel domain.
 */
export function getAuthRedirectUrl(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return `${window.location.origin}${window.location.pathname}`;
}
