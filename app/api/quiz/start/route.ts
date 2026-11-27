import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { enforceRateLimits, getTrustedClientIp } from "@/lib/rate-limit";
import { HttpRequestError, isSameOriginRequest, readJsonRequest } from "@/lib/http";

const QUESTION_COUNTS = [10, 20, 40, 80];

type StartBody = {
  subjectId?: unknown;
  questionCount?: unknown;
};

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to start a quiz." }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Quiz sessions are not configured on the server." },
      { status: 503 }
    );
  }

  const ip = getTrustedClientIp(request.headers);
  const limits = [
    { namespace: "api:quiz-start:user", identifier: user.id, limit: 10, windowSeconds: 60 },
    ...(ip
      ? [{ namespace: "api:quiz-start:ip", identifier: ip, limit: 180, windowSeconds: 60 }]
      : [])
  ];

  try {
    const allowed = await enforceRateLimits(limits);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many quiz requests. Please wait before trying again." },
        { status: 429, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Security checks are temporarily unavailable. Please retry." },
      { status: 503 }
    );
  }

  let body: StartBody;
  try {
    body = await readJsonRequest<StartBody>(request, 2_048);
  } catch (error) {
    const status = error instanceof HttpRequestError ? error.status : 400;
    const message = error instanceof HttpRequestError ? error.message : "Invalid request body.";
    return NextResponse.json({ error: message }, { status });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const subjectId = body.subjectId;
  const questionCount = body.questionCount;

  if (
    typeof subjectId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subjectId) ||
    typeof questionCount !== "number" ||
    !QUESTION_COUNTS.includes(questionCount)
  ) {
    return NextResponse.json({ error: "Choose a valid subject and quiz length." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("create_quiz_session", {
      p_user_id: user.id,
      p_subject_id: subjectId,
      p_question_count: questionCount
    });

    if (error) {
      console.error("Quiz session creation failed:", {
        code: error.code,
        message: error.message,
        details: error.details
      });

      const limited = /limit reached|wait before starting/i.test(error.message);
      return NextResponse.json(
        {
          error: limited
            ? error.message
            : /not enough published questions/i.test(error.message)
              ? error.message
              : "Could not create this quiz. Please retry."
        },
        { status: limited ? 429 : 400 }
      );
    }

    if (
      !data ||
      typeof data !== "object" ||
      !("sessionId" in data) ||
      !("questions" in data)
    ) {
      console.error("Quiz session RPC returned an invalid payload.");
      return NextResponse.json({ error: "Could not create this quiz." }, { status: 500 });
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Quiz session service failed:", error);
    return NextResponse.json({ error: "Quiz service is temporarily unavailable." }, { status: 500 });
  }
}
