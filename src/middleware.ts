import { defineMiddleware } from "astro:middleware";
import { createSupabaseServerClient } from "./lib/supabase-server";
import { getAdminMembro } from "./lib/auth";

const PUBLIC_ADMIN_PATHS = ["/admin/login"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return next();
  if (PUBLIC_ADMIN_PATHS.includes(context.url.pathname)) return next();

  const supabase = createSupabaseServerClient(context.cookies, context.request);
  const membro = await getAdminMembro(supabase);

  if (!membro) {
    return context.redirect("/admin/login");
  }

  context.locals.membro = membro;
  return next();
});
