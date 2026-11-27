import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function createSecurityHeaders(request: NextRequest) {
  const nonce = Buffer.from(randomUUID()).toString("base64");
  const scriptSources = ["'self'", "'nonce-" + nonce + "'", "https://va.vercel-scripts.com"];
  if (process.env.NODE_ENV !== "production") scriptSources.push("'unsafe-eval'");

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self' https://*.supabase.co https://accounts.google.com",
    "script-src " + scriptSources.join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://va.vercel-scripts.com https://vitals.vercel-insights.com",
    "frame-src 'self' https://accounts.google.com https://*.supabase.co",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : [])
  ];
  const policy = directives.join("; ");

  const nextResponse = () => {
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set("x-nonce", nonce);
    forwardedHeaders.set("Content-Security-Policy", policy);

    const response = NextResponse.next({
      request: { headers: forwardedHeaders }
    });
    response.headers.set("Content-Security-Policy", policy);
    return response;
  };

  return { nextResponse };
}

export async function updateSession(request: NextRequest) {
  const { nextResponse } = createSecurityHeaders(request);
  const pathname = request.nextUrl.pathname;
  const requiresSession = [
    "/dashboard",
    "/admin",
    "/quiz",
    "/result",
    "/api/quiz",
    "/api/admin"
  ].some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));

  // Keep CSP/security headers on every request, but avoid a Supabase auth
  // round-trip for public pages and static assets.
  if (!requiresSession) {
    return nextResponse();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return nextResponse();
  }

  let response = nextResponse();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = nextResponse();
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers ?? {}).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      }
    }
  });

  // Verifies the JWT and refreshes expired sessions when necessary.
  await supabase.auth.getClaims();
  return response;
}
