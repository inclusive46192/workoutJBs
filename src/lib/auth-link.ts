import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";

/**
 * Completing a login that arrives back as a URL.
 *
 * Email login uses codes, not links, so the regular caller here is OAuth:
 * Google and GitHub return to `?code=...`, which is exchanged for a session.
 * That works because the provider comes back to the very same browser that
 * started the flow, so the PKCE code verifier is present.
 *
 * Two further cases are handled defensively rather than as the normal path:
 *
 * 1. `?token_hash=...&type=...` - a link from an older mail template, verified
 *    with `verifyOtp`. This needs no locally stored secret and therefore also
 *    works when the mail app opened a different browser.
 * 2. A stale or foreign `?code=...` whose verifier is missing, which is exactly
 *    what happens when a link is tapped outside the installed PWA. This must
 *    fail with an explanation instead of hanging.
 *
 * Supabase reports failures either as query parameters or in the URL fragment,
 * so both are inspected.
 */

export type LinkResult =
  | { status: "none" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

const otpTypes: EmailOtpType[] = [
  "email",
  "signup",
  "magiclink",
  "invite",
  "recovery",
  "email_change",
];

function parseOtpType(value: string | null): EmailOtpType {
  const match = otpTypes.find((candidate) => candidate === value);
  return match ?? "email";
}

/** Reads auth parameters from both the query string and the fragment. */
function readAuthParams(): URLSearchParams {
  const merged = new URLSearchParams(window.location.search);
  const fragment = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  for (const [key, value] of new URLSearchParams(fragment)) {
    if (!merged.has(key)) {
      merged.set(key, value);
    }
  }
  return merged;
}

/**
 * Removes the auth parameters from the address bar.
 *
 * A token may only be redeemed once. Leaving it in the URL means a reload or a
 * restored tab retries a spent token and shows a confusing failure.
 */
function stripAuthParams() {
  const url = new URL(window.location.href);
  const consumed = [
    "token_hash",
    "token",
    "type",
    "code",
    "error",
    "error_code",
    "error_description",
    "access_token",
    "refresh_token",
    "expires_in",
    "expires_at",
    "provider_token",
    "token_type",
  ];
  for (const key of consumed) {
    url.searchParams.delete(key);
  }
  url.hash = "";
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

function describeLinkError(raw: string, code: string | null): string {
  const text = `${code ?? ""} ${raw}`.toLowerCase();
  if (text.includes("expired")) {
    return "Der Link ist abgelaufen. Fordere in der App einen neuen Code an.";
  }
  if (text.includes("code verifier")) {
    return "Der Link wurde in einem anderen Browser geöffnet. Melde dich in der App mit dem 6-stelligen Code an.";
  }
  if (text.includes("already") || text.includes("used")) {
    return "Dieser Link wurde bereits verwendet. Fordere in der App einen neuen Code an.";
  }
  return raw || "Die Anmeldung hat nicht geklappt. Fordere in der App einen neuen Code an.";
}

/**
 * Finishes a login that came back through the URL. Returns `none` when the URL
 * carries no auth information, which is the normal start of the app.
 */
export async function completeAuthFromUrl(client: SupabaseClient): Promise<LinkResult> {
  if (typeof window === "undefined") {
    return { status: "none" };
  }

  const params = readAuthParams();

  const errorDescription = params.get("error_description") ?? params.get("error");
  if (errorDescription) {
    stripAuthParams();
    return {
      status: "error",
      message: describeLinkError(errorDescription.replace(/\+/g, " "), params.get("error_code")),
    };
  }

  const tokenHash = params.get("token_hash") ?? params.get("token");
  if (tokenHash) {
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: parseOtpType(params.get("type")),
    });
    stripAuthParams();
    return error
      ? { status: "error", message: describeLinkError(error.message, null) }
      : { status: "ok", message: "Angemeldet." };
  }

  const code = params.get("code");
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    stripAuthParams();
    return error
      ? { status: "error", message: describeLinkError(error.message, null) }
      : { status: "ok", message: "Angemeldet." };
  }

  return { status: "none" };
}
