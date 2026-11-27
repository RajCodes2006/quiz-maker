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

  // Read missed questions and their answer keys only on the server, after ownership
  // of the attempt has been verified above.
  const { data: wrongResponses, error: responsesError } = await admin
    .from("quiz_responses")
    .select("question_id")
    .eq("attempt_id", attempt.id)
    .eq("is_correct", false);

  let wrongQuestions: {
    id: string;
    question_text: string;
    correctOption: string | null;
    correctText: string | null;
  }[] = [];
  let reviewUnavailable = Boolean(responsesError);

  if (!responsesError && wrongResponses && wrongResponses.length > 0) {
    const questionIds = wrongResponses.map((response) => response.question_id);
    const [questionsResult, answersResult] = await Promise.all([
      admin
        .from("questions")
        .select("id, question_text, option_a, option_b, option_c, option_d")
        .in("id", questionIds),
      admin
        .from("question_answers")
        .select("question_id, correct_option")
        .in("question_id", questionIds)
    ]);

    if (questionsResult.error || answersResult.error) {
      reviewUnavailable = true;
    } else {
      const questionById = new Map(
        (questionsResult.data ?? []).map((question) => [question.id, question])
      );
      const answerById = new Map(
        (answersResult.data ?? []).map((answer) => [answer.question_id, answer.correct_option])
      );

      wrongQuestions = questionIds.flatMap((questionId) => {
        const question = questionById.get(questionId);
        if (!question) return [];

        const correctOption = answerById.get(questionId) ?? null;
        const correctText = correctOption
          ? ({
              A: question.option_a,
              B: question.option_b,
              C: question.option_c,
              D: question.option_d
            }[correctOption] ?? null)
          : null;

        return [{
          id: question.id,
          question_text: question.question_text,
          correctOption,
          correctText
        }];
      });
    }
  }

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

        <section className="result-review" aria-labelledby="result-review-title">
          <div className="result-review-heading">
            <div>
              <div className="eyebrow">ANSWER REVIEW</div>
              <h2 id="result-review-title">Questions to revisit</h2>
            </div>
            {!reviewUnavailable && (
              <span className="review-count">
                {wrongQuestions.length} {wrongQuestions.length === 1 ? "wrong" : "wrong"}
              </span>
            )}
          </div>

          {reviewUnavailable ? (
            <div className="notice notice-error" role="status">
              Your score was saved, but the question review could not be loaded. Refresh the page to try again.
            </div>
          ) : wrongQuestions.length === 0 ? (
            <div className="review-perfect">
              <strong>All correct. No mistakes to review.</strong>
              <span>You got every question right in this attempt.</span>
            </div>
          ) : (
            <ol className="review-list">
              {wrongQuestions.map((question, index) => (
                <li className="review-item" key={question.id}>
                  <div className="review-question-number">Question {index + 1}</div>
                  <h3>{question.question_text}</h3>
                  <div className="review-answer">
                    <span>Correct answer</span>
                    <strong>
                      {question.correctOption && question.correctText
                        ? `${question.correctOption}. ${question.correctText}`
                        : "Correct answer unavailable"}
                    </strong>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="hero-actions">
          <Link className="button" href="/dashboard">Back to subjects</Link>
          <Link className="button button-quiet" href={"/quiz/" + attempt.subject_id}>Try again</Link>
        </div>
      </div>
    </main>
  );
}
