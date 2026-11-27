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

  // Load saved responses only after verifying the attempt belongs to this user.
  const { data: responses, error: responsesError } = await admin
    .from("quiz_responses")
    .select("question_id, selected_option, selected_option_text, is_correct")
    .eq("attempt_id", attempt.id)
    .order("question_id", { ascending: true });

  type QuestionResult = {
    id: string;
    question_text: string;
    isCorrect: boolean;
    selectedAnswer: string | null;
    correctAnswer: string | null;
  };

  let questionResults: QuestionResult[] = [];
  let resultsUnavailable = Boolean(responsesError);

  if (!responsesError && responses && responses.length > 0) {
    const questionIds = responses.map((response) => response.question_id);
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
      resultsUnavailable = true;
    } else {
      const questionById = new Map(
        (questionsResult.data ?? []).map((question) => [question.id, question])
      );
      const answerById = new Map(
        (answersResult.data ?? []).map((answer) => [answer.question_id, answer.correct_option])
      );

      questionResults = responses.flatMap((response) => {
        const question = questionById.get(response.question_id);
        if (!question) return [];

        const correctOption = answerById.get(response.question_id);
        const correctAnswer =
          correctOption === "A" ? question.option_a :
          correctOption === "B" ? question.option_b :
          correctOption === "C" ? question.option_c :
          correctOption === "D" ? question.option_d :
          null;

        // Older attempts did not save the selected option text. For an older
        // correct answer, it is safe to infer the selected text from the key.
        // For older incorrect answers, do not guess which shuffled option was picked.
        const selectedAnswer = response.selected_option_text
          ? `${response.selected_option ? response.selected_option + ". " : ""}${response.selected_option_text}`
          : response.is_correct
            ? `${response.selected_option ? response.selected_option + ". " : ""}${correctAnswer ?? ""}`
            : response.selected_option
              ? `Option ${response.selected_option} (answer text was not saved for this older attempt)`
              : null;

        return [{
          id: question.id,
          question_text: question.question_text,
          isCorrect: response.is_correct,
          selectedAnswer,
          correctAnswer
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
          <div className="metric"><strong>{attempt.correct_count}</strong><span>Correct</span></div>
          <div className="metric"><strong>{attempt.total_questions - attempt.correct_count}</strong><span>Incorrect</span></div>
          <div className="metric"><strong>{attempt.total_questions}</strong><span>Total questions</span></div>
        </div>

        <p className="muted">Completed {new Date(attempt.completed_at).toLocaleString()}</p>

        <div className="question-results">
          <div className="question-results-heading">
            <h2>Question results</h2>
            {!resultsUnavailable && (
              <span>{questionResults.filter((item) => item.isCorrect).length} of {attempt.total_questions} correct</span>
            )}
          </div>

          {resultsUnavailable || questionResults.length === 0 ? (
            <div className="notice notice-error" role="status">
              Your score was saved, but the question-by-question results could not be loaded.
            </div>
          ) : (
            <ol className="question-results-list">
              {questionResults.map((question, index) => (
                <li
                  className={"question-result-item " + (question.isCorrect ? "is-correct" : "is-incorrect")}
                  key={question.id}
                >
                  <div className="question-result-topline">
                    <span className="question-result-number">Question {index + 1}</span>
                    <span className={"question-result-status " + (question.isCorrect ? "status-correct" : "status-incorrect")}>
                      {question.isCorrect ? "✓ Correct" : "✕ Incorrect"}
                    </span>
                  </div>
                  <h3>{question.question_text}</h3>
                  <div className="question-answer-details">
                    <p className="question-answer-line your-answer">
                      <strong>Your answer:</strong>{" "}
                      {question.selectedAnswer || "Not recorded for this earlier attempt"}
                    </p>
                    {!question.isCorrect && (
                      <p className="question-answer-line correct-answer">
                        <strong>Correct answer:</strong>{" "}
                        {question.correctAnswer || "Unavailable"}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="hero-actions">
          <Link className="button" href="/dashboard">Back to subjects</Link>
          <Link className="button button-quiet" href={"/quiz/" + attempt.subject_id}>Try again</Link>
        </div>
      </div>
    </main>
  );
}
