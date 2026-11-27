"use server";

import { randomUUID } from "node:crypto";
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

type CsvRecord = { cells: string[]; line: number };

function parseCsv(input: string): { records: CsvRecord[]; error?: string } {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
        if (char === "\n") line += 1;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      cells.push(field);
      if (cells.some((value) => value.trim() !== "")) {
        records.push({ cells, line: recordLine });
      }
      cells = [];
      field = "";
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      line += 1;
      recordLine = line;
    } else if (char === '"') {
      return { records: [], error: "Unexpected quote in CSV near line " + line };
    } else {
      field += char;
    }
  }

  if (inQuotes) return { records: [], error: "A quoted field was not closed." };

  cells.push(field);
  if (cells.some((value) => value.trim() !== "")) {
    records.push({ cells, line: recordLine });
  }

  return { records };
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
    await supabase.from("questions").delete().eq("id", question.id);
    redirect("/admin?error=" + encodeURIComponent(answerError.message));
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
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

  const supabase = await requireAdminClient();
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
    subject_id: subjectId,
    question_text: row.question_text,
    option_a: row.option_a,
    option_b: row.option_b,
    option_c: row.option_c,
    option_d: row.option_d,
    is_published: true
  }));

  const { error: questionsError } = await supabase
    .from("questions")
    .insert(questionRows);

  if (questionsError) {
    redirect("/admin?error=" + encodeURIComponent(questionsError.message));
  }

  const answerRows = questionRows.map((question, index) => ({
    question_id: question.id,
    correct_option: validRows[index].correct_option
  }));

  const { error: answersError } = await supabase
    .from("question_answers")
    .insert(answerRows);

  if (answersError) {
    await supabase
      .from("questions")
      .delete()
      .in("id", questionRows.map((question) => question.id));
    redirect(
      "/admin?error=" +
      encodeURIComponent("Answer keys could not be saved; the imported questions were rolled back. " + answersError.message)
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
