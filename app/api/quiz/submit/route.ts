import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

type SubmitBody = {
  subjectId?: string;
  questionIds?: string[];
  answers?: Record<string, string>;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to submit a quiz." }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Server scoring is not configured. Add SUPABASE_SECRET_KEY." }, { status: 503 });
  }

  let body: SubmitBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const subjectId = body.subjectId;
  const questionIds = body.questionIds;
  const answers = body.answers || {};

  if (
    typeof subjectId !== "string" ||
    !Array.isArray(questionIds) ||
    questionIds.length < 1 ||
    questionIds.length > 100 ||
    questionIds.some((id) => typeof id !== "string") ||
    new Set(questionIds).size !== questionIds.length
  ) {
    return NextResponse.json({ error: "Invalid quiz submission." }, { status: 400 });
  }

  for (const questionId of questionIds) {
    const selected = answers[questionId];
    if (selected && !["A", "B", "C", "D"].includes(selected)) {
      return NextResponse.json({ error: "One or more selected options are invalid." }, { status: 400 });
    }
  }

  // Verify the subject with the same authenticated client that loaded the quiz.
  // This avoids a false "unavailable" result caused by a mismatched server-only key.
  const { data: subject, error: subjectError } = await supabase
    .from("subjects")
    .select("id")
    .eq("id", subjectId)
    .eq("is_active", true)
    .maybeSingle();

  if (subjectError) {
    console.error("Quiz submission subject lookup failed:", {
      code: subjectError.code,
      message: subjectError.message,
      details: subjectError.details,
      hint: subjectError.hint
    });
    return NextResponse.json(
      { error: "Could not verify this subject with your signed-in account. Please sign in again and retry." },
      { status: 500 }
    );
  }

  if (!subject) {
    return NextResponse.json({ error: "This subject is inactive or does not exist." }, { status: 404 });
  }

  const admin = createAdminClient();

  const { data: questions, error: questionError } = await admin
    .from("questions")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("is_published", true)
    .in("id", questionIds);

  if (questionError || !questions || questions.length !== questionIds.length) {
    return NextResponse.json({ error: "The quiz questions could not be verified." }, { status: 400 });
  }

  const { data: answerKeys, error: answerError } = await admin
    .from("question_answers")
    .select("question_id, correct_option")
    .in("question_id", questionIds);

  if (answerError || !answerKeys || answerKeys.length !== questionIds.length) {
    return NextResponse.json({ error: "The answer key is incomplete. Contact an administrator." }, { status: 500 });
  }

  const answerMap = new Map(answerKeys.map((item) => [item.question_id, item.correct_option]));
  const correctCount = questionIds.reduce((count, id) => {
    return count + (answers[id] === answerMap.get(id) ? 1 : 0);
  }, 0);

  const { data: attempt, error: attemptError } = await admin
    .from("quiz_attempts")
    .insert({
      user_id: user.id,
      subject_id: subjectId,
      total_questions: questionIds.length,
      correct_count: correctCount,
      score: correctCount
    })
    .select("id")
    .single();

  if (attemptError || !attempt) {
    return NextResponse.json({ error: "Could not save your quiz result." }, { status: 500 });
  }

  const responseRows = questionIds.map((id) => ({
    attempt_id: attempt.id,
    question_id: id,
    selected_option: answers[id] || null,
    is_correct: Boolean(answers[id] && answers[id] === answerMap.get(id))
  }));

  const { error: responseError } = await admin.from("quiz_responses").insert(responseRows);

  if (responseError) {
    await admin.from("quiz_attempts").delete().eq("id", attempt.id).eq("user_id", user.id);
    return NextResponse.json({ error: "Could not save your submitted answers." }, { status: 500 });
  }

  return NextResponse.json({ attemptId: attempt.id, correctCount, totalQuestions: questionIds.length });
}
