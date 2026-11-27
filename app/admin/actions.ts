"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimits, getTrustedClientIp } from "@/lib/rate-limit";
import { parseCsv } from "@/lib/csv";

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
  return { supabase, user };
}

async function requireAdminRateLimit(
  action: string,
  userId: string,
  userLimit: number,
  ipLimit: number,
  windowSeconds: number
) {
  const ip = getTrustedClientIp(await headers());
  const rules = [
    {
      namespace: "admin:" + action + ":user",
      identifier: userId,
      limit: userLimit,
      windowSeconds
    },
    ...(ip
      ? [{
          namespace: "admin:" + action + ":ip",
          identifier: ip,
          limit: ipLimit,
          windowSeconds
        }]
      : [])
  ];

  let allowed: boolean;
  try {
    allowed = await enforceRateLimits(rules);
  } catch {
    redirect("/admin?error=Security+checks+are+temporarily+unavailable");
  }

  if (!allowed) redirect("/admin?error=Too+many+admin+requests.+Please+wait+before+retrying");
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

  const { supabase, user } = await requireAdminClient();
  await requireAdminRateLimit("create-subject", user.id, 5, 60, 600);
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
  const subjectId = String(formData.get("subject_id") || "").trim();
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

  const { supabase, user } = await requireAdminClient();
  await requireAdminRateLimit("create-question", user.id, 60, 120, 600);
  const { error } = await supabase.rpc("create_question_with_answer", {
    p_subject_id: subjectId,
    p_question_text: questionText,
    p_option_a: optionA,
    p_option_b: optionB,
    p_option_c: optionC,
    p_option_d: optionD,
    p_correct_option: correctOption
  });

  if (error) {
    redirect("/admin?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/quiz/" + subjectId);
  redirect("/admin?message=Question+added");
}

export async function importQuestionsCsv(formData: FormData) {
  const subjectId = String(formData.get("subject_id") || "").trim();
  const upload = formData.get("csv_file");

  if (!subjectId) redirect("/admin?error=Select+a+subject+for+the+CSV+file");
  if (!(upload instanceof File) || upload.size === 0) {
    redirect("/admin?error=Choose+a+CSV+file+to+upload");
  }
  if (!upload.name.toLowerCase().endsWith(".csv")) {
    redirect("/admin?error=Upload+a+file+with+the+.csv+extension");
  }
  if (upload.size > 1_000_000) {
    redirect("/admin?error=CSV+file+must+be+smaller+than+1+MB");
  }

  const { supabase, user } = await requireAdminClient();
  await requireAdminRateLimit("csv-import", user.id, 3, 20, 3600);

  const parsed = parseCsv((await upload.text()).replace(/^\uFEFF/, ""));
  if (parsed.error) redirect("/admin?error=" + encodeURIComponent(parsed.error));
  if (parsed.records.length < 2) {
    redirect("/admin?error=CSV+must+contain+a+header+and+at+least+one+question");
  }

  const headers = parsed.records[0].cells.map((value) => value.trim().toLowerCase());
  const requiredHeaders = [
    "question_text",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "correct_option"
  ];
  const headerIndexes: Record<string, number> = {};

  for (const header of requiredHeaders) {
    const matches = headers.reduce<number[]>((indexes, value, index) => {
      if (value === header) indexes.push(index);
      return indexes;
    }, []);
    if (matches.length !== 1) {
      redirect(
        "/admin?error=" +
        encodeURIComponent("CSV needs exactly one " + header + " column.")
      );
    }
    headerIndexes[header] = matches[0];
  }

  const dataRecords = parsed.records.slice(1);
  if (dataRecords.length > 500) {
    redirect("/admin?error=Maximum+500+questions+per+CSV+upload");
  }

  const validationErrors: string[] = [];
  const validRows: Array<{
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: string;
  }> = [];

  for (const record of dataRecords) {
    const value = (name: string) =>
      (record.cells[headerIndexes[name]] || "").trim();

    const question = {
      question_text: value("question_text"),
      option_a: value("option_a"),
      option_b: value("option_b"),
      option_c: value("option_c"),
      option_d: value("option_d"),
      correct_option: value("correct_option").toUpperCase()
    };

    if (
      question.question_text.length < 5 ||
      !question.option_a ||
      !question.option_b ||
      !question.option_c ||
      !question.option_d ||
      !["A", "B", "C", "D"].includes(question.correct_option)
    ) {
      validationErrors.push(
        "Row " + record.line + ": add a question, all four options, and correct_option A/B/C/D."
      );
      continue;
    }

    validRows.push(question);
  }

  if (validationErrors.length > 0) {
    const shownErrors = validationErrors.slice(0, 4).join(" ");
    const remainder = validationErrors.length > 4
      ? " +" + (validationErrors.length - 4) + " more invalid row(s)."
      : "";
    redirect(
      "/admin?error=" +
      encodeURIComponent("Nothing was imported. " + shownErrors + remainder)
    );
  }

  if (validRows.length === 0) {
    redirect("/admin?error=No+valid+questions+found+in+the+CSV");
  }

  const { data: subject, error: subjectError } = await supabase
    .from("subjects")
    .select("id")
    .eq("id", subjectId)
    .maybeSingle();

  if (subjectError || !subject) {
    redirect("/admin?error=Selected+subject+was+not+found");
  }

  const questionRows = validRows.map((row) => ({
    id: randomUUID(),
    question_text: row.question_text,
    option_a: row.option_a,
    option_b: row.option_b,
    option_c: row.option_c,
    option_d: row.option_d,
    correct_option: row.correct_option
  }));

  // A single PostgreSQL function inserts questions and answer keys atomically.
  const { data: importedCount, error: importError } = await supabase.rpc(
    "import_questions_with_answers",
    { p_subject_id: subjectId, p_rows: questionRows }
  );

  if (importError || importedCount !== validRows.length) {
    redirect(
      "/admin?error=" +
      encodeURIComponent(importError?.message || "The database did not confirm the complete import.")
    );
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/quiz/" + subjectId);
  redirect(
    "/admin?message=" +
    encodeURIComponent(validRows.length + " questions and answer keys imported successfully.")
  );
}
