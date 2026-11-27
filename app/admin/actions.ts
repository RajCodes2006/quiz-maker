"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireAdminClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");
  return supabase;
}

export async function createSubject(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();

  if (name.length < 2) redirect("/admin?error=Subject+name+is+too+short");

  const slug = name.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const supabase = await requireAdminClient();
  const { error } = await supabase.from("subjects").insert({
    name,
    slug,
    description,
    is_active: true
  });

  if (error) redirect("/admin?error=" + encodeURIComponent(error.message));
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?message=Subject+created");
}

export async function createQuestion(formData: FormData) {
  const subjectId = String(formData.get("subject_id") || "");
  const questionText = String(formData.get("question_text") || "").trim();
  const optionA = String(formData.get("option_a") || "").trim();
  const optionB = String(formData.get("option_b") || "").trim();
  const optionC = String(formData.get("option_c") || "").trim();
  const optionD = String(formData.get("option_d") || "").trim();
  const correctOption = String(formData.get("correct_option") || "");

  if (
    !subjectId || questionText.length < 5 ||
    !optionA || !optionB || !optionC || !optionD ||
    !["A", "B", "C", "D"].includes(correctOption)
  ) {
    redirect("/admin?error=Complete+the+question+and+all+four+options");
  }

  const supabase = await requireAdminClient();
  const { data: question, error } = await supabase
    .from("questions")
    .insert({
      subject_id: subjectId,
      question_text: questionText,
      option_a: optionA,
      option_b: optionB,
      option_c: optionC,
      option_d: optionD,
      is_published: true
    })
    .select("id")
    .single();

  if (error || !question) {
    redirect("/admin?error=" + encodeURIComponent(error?.message || "Could not save question"));
  }

  const { error: answerError } = await supabase.from("question_answers").insert({
    question_id: question.id,
    correct_option: correctOption
  });

  if (answerError) {
    // Avoid leaving a question in the bank without its answer key.
    await supabase.from("questions").delete().eq("id", question.id);
    redirect("/admin?error=" + encodeURIComponent(answerError.message));
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?message=Question+added");
}
