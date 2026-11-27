import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function requireUser() {
  if (!isSupabaseConfigured()) {
    redirect("/login?error=Configure+Supabase+first");
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  return { user, profile, supabase };
}

export async function requireAdmin() {
  const context = await requireUser();

  if (context.profile?.role !== "admin") {
    redirect("/dashboard?error=Admin+access+required");
  }

  return context;
}
