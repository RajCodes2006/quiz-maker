import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = { params: Promise<{ attemptId: string }> };

export default async function ResultPage({ params }: Props) {
  const { attemptId } = await params;
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data: attempt } = await admin
    .from("quiz_attempts")
    .select("id, subject_id, score, correct_count, total_questions, completed_at")
    .eq("id", attemptId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!attempt) notFound();

  const { data: subject } = await admin
    .from("subjects")
    .select("name")
    .eq("id", attempt.subject_id)
    .maybeSingle();

  const percentage = attempt.total_questions > 0
    ? Math.round((attempt.correct_count / attempt.total_questions) * 100)
    : 0;

  return (
    <main className="quiz-wrap">
      <div className="panel">
        <div className="eyebrow">QUIZ COMPLETED</div>
        <h1 className="page-heading" style={{ marginTop: 12 }}>{subject?.name || "Quiz result"}</h1>
        <p className="page-subtitle">Your result has been saved to your account.</p>
        <div style={{ marginTop: 34 }}>
          <div className="result-score">{percentage}%</div>
          <p className="muted">Overall score</p>
        </div>
        <div className="result-metrics">
          <div className="metric"><strong>{attempt.correct_count}</strong><span>Correct answers</span></div>
          <div className="metric"><strong>{attempt.total_questions - attempt.correct_count}</strong><span>Incorrect / unanswered</span></div>
          <div className="metric"><strong>{attempt.total_questions}</strong><span>Total questions</span></div>
        </div>
        <p className="muted">Completed {new Date(attempt.completed_at).toLocaleString()}</p>
        <div className="hero-actions">
          <Link className="button" href="/dashboard">Back to subjects</Link>
          <Link className="button button-quiet" href={"/quiz/" + attempt.subject_id}>Try again</Link>
        </div>
      </div>
    </main>
  );
}
