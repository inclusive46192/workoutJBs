import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";

/**
 * Completing an email login that arrives back as a URL.
 *
 * Two link styles can land here:
 *
 * 1. `?token_hash=...&type=...` - verified with `verifyOtp`. This needs no
 *    locally stored secret, so it also works when the mail app opens the link
 *    in a different browser than the one that requested it. That is the normal
 *    case on iOS: the request happens inside the installed PWA, the tap happens
 *    in Mail, and Safari opens with its own storage. This is the style the mail
 *    template should use.
 * 2. `?code=...` - the PKCE style. It requires the code verifier that was
 *    stored when the mail was requested, so it only works in the very same
 *    browser context. OAuth stays on this path because the provider returns to
 *    the same browser; magic links must not rely on it.
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
    return "Der Link ist abgelaufen. Fordere eine neue Mail an oder nutze den 6-stelligen Code.";
  }
  if (text.includes("code verifier")) {
    return "Der Link wurde in einem anderen Browser geöffnet. Trage stattdessen den 6-stelligen Code aus derselben Mail hier ein.";
  }
  if (text.includes("already") || text.includes("used")) {
    return "Dieser Link wurde bereits verwendet. Fordere eine neue Mail an.";
  }
  return raw || "Die Anmeldung über den Link hat nicht geklappt.";
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
