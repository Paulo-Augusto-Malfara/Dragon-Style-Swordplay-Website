import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../lib/supabase-server";

export const prerender = false;

// Only allow same-site relative paths -- rejects absolute/protocol-relative
// URLs (e.g. "https://evil.com" or "//evil.com") to avoid an open redirect.
function safeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

export const GET: APIRoute = async ({ url, cookies, request, redirect }) => {
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = createSupabaseServerClient(cookies, request);
    await supabase.auth.exchangeCodeForSession(code);
  }

  return redirect(next);
};
