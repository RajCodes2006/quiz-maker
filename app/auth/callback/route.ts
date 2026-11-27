import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function loginError(request: NextRequest, message: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error_description")
    || request.nextUrl.searchParams.get("error");

  if (providerError) {
    return loginError(request, providerError);
  }

  if (!code) {
    return loginError(request, "Google sign-in was not completed. Please try again.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("OAuth callback session exchange failed:", error.message);
    return loginError(request, "Could not complete Google sign-in. Please try again.");
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
