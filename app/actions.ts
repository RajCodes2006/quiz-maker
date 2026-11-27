"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { enforceRateLimits, getTrustedClientIp } from "@/lib/rate-limit";

async function enforceAuthRateLimit(
  flow: "signin" | "signup",
  email: string,
  ipLimit: number,
  accountLimit: number,
  windowSeconds: number
) {
  const ip = getTrustedClientIp(await headers());
  const rules = [
    {
      namespace: "auth:" + flow + ":email",
      identifier: email.toLowerCase(),
      limit: accountLimit,
      windowSeconds
    },
    ...(ip
      ? [{
          namespace: "auth:" + flow + ":ip",
          identifier: ip,
          limit: ipLimit,
          windowSeconds
        }]
      : [])
  ];

  try {
    return await enforceRateLimits(rules);
  } catch {
    redirect("/login?mode=" + flow + "&error=Security+checks+are+temporarily+unavailable");
  }
}

export async function signIn(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/login?mode=signin&error=Add+your+Supabase+environment+variables");
  }

  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || email.length > 320 || !password || password.length > 1024) {
    redirect("/login?mode=signin&error=Enter+a+valid+email+and+password");
  }

  const allowed = await enforceAuthRateLimit("signin", email, 120, 20, 900);
  if (!allowed) {
    redirect("/login?mode=signin&error=Too+many+sign-in+attempts.+Wait+15+minutes+and+try+again");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data.user) {
    redirect("/login?mode=signin&error=" + encodeURIComponent(error?.message || "Login failed"));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  redirect(profile?.role === "admin" ? "/admin" : "/dashboard");
}

export async function signUp(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/login?mode=signup&error=Add+your+Supabase+environment+variables");
  }

  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!fullName || fullName.length > 120 || !email || email.length > 320 || password.length < 8 || password.length > 1024) {
    redirect("/login?mode=signup&error=Enter+your+name,+valid+email,+and+a+password+of+at+least+8+characters");
  }

  const allowed = await enforceAuthRateLimit("signup", email, 30, 5, 3600);
  if (!allowed) {
    redirect("/login?mode=signup&error=Too+many+registration+attempts.+Try+again+later");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: process.env.NEXT_PUBLIC_SITE_URL
        ? process.env.NEXT_PUBLIC_SITE_URL + "/auth/callback"
        : undefined
    }
  });

  if (error) {
    redirect("/login?mode=signup&error=" + encodeURIComponent(error.message));
  }

  redirect("/login?mode=signin&message=Account+created.+Check+your+email+if+confirmation+is+enabled.");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
