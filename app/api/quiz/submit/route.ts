import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { enforceRateLimits, getTrustedClientIp } from "@/lib/rate-limit";
import { HttpRequestError, isSameOriginRequest, readJsonRequest } from "@/lib/http";

type SubmitBody = {
  sessionId?: unknown;
  answers?: unknown;
};

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to submit a quiz." }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server-side quiz scoring is not configured." },
      { status: 503 }
    );
  }

  const ip = getTrustedClientIp(request.headers);
  const limits = [
    { namespace: "api:quiz-submit:user", identifier: user.id, limit: 30, windowSeconds: 60 },
    ...(ip
      ? [{ namespace: "api:quiz-submit:ip", identifier: ip, limit: 180, windowSeconds: 60 }]
      : [])
  ];

  try {
    const allowed = await enforceRateLimits(limits);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many submission requests. Please wait before trying again." },
        { status: 429, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Security checks are temporarily unavailable. Please retry." },
      { status: 503 }
    );
  }

  let body: SubmitBody;
  try {
    body = await readJsonRequest<SubmitBody>(request, 32_768);
  } catch (error) {
    const status = error instanceof HttpRequestError ? error.status : 400;
    const message = error instanceof HttpRequestError ? error.message : "Invalid request body.";
    return NextResponse.json({ error: message }, { status });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid quiz submission." }, { status: 400 });
  }

  const sessionId = body.sessionId;
  const answers = body.answers;

  if (
    typeof sessionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId) ||
    !answers ||
    typeof answers !== "object" ||
    Array.isArray(answers)
  ) {
    return NextResponse.json({ error: "Invalid quiz submission." }, { status: 400 });
  }

  const answerEntries = Object.entries(answers as Record<string, unknown>);
  if (
    ![10, 20, 40, 80].includes(answerEntries.length) ||
    answerEntries.some(([questionId, token]) =>
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(questionId) ||
      typeof token !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
    )
  ) {
    return NextResponse.json(
      { error: "Answer every question using one of its displayed options." },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("submit_quiz_session", {
      p_user_id: user.id,
      p_session_id: sessionId,
      p_answers: answers
    });

    if (error) {
      console.error("Quiz session submission rejected:", {
        code: error.code,
        message: error.message
      });

      const message = /already been submitted|expired|not found|answer every question|selected options are invalid/i.test(error.message)
        ? error.message
        : "This quiz could not be submitted. Start a new quiz and try again.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (!data || typeof data !== "object" || !("attemptId" in data)) {
      console.error("Quiz submission RPC returned an invalid result.");
      return NextResponse.json({ error: "Could not save your quiz result." }, { status: 500 });
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Quiz submission service failed:", error);
    return NextResponse.json({ error: "Quiz service is temporarily unavailable." }, { status: 500 });
  }
}
