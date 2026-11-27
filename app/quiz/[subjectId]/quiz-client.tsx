"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type OptionKey = "A" | "B" | "C" | "D";

type QuizQuestion = {
  id: string;
  question_text: string;
  options: { token: string; label: OptionKey; text: string }[];
};

type Props = {
  subjectId: string;
  subjectName: string;
  availableQuestionCount: number;
};

const QUESTION_COUNTS = [10, 20, 40, 80] as const;

export default function QuizClient({
  subjectId,
  subjectName,
  availableQuestionCount
}: Props) {
  const router = useRouter();
  const availableCounts = QUESTION_COUNTS.filter(
    (count) => count <= availableQuestionCount
  );

  const [questionCount, setQuestionCount] = useState<number>(availableCounts[0] ?? 0);
  const [quizStarted, setQuizStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function startQuiz() {
    if (
      starting ||
      !availableCounts.includes(questionCount as (typeof QUESTION_COUNTS)[number])
    ) return;

    setStarting(true);
    setError("");

    try {
      const response = await fetch("/api/quiz/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, questionCount })
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Could not start this quiz.");
        setStarting(false);
        return;
      }

      if (
        typeof result.sessionId !== "string" ||
        !Array.isArray(result.questions) ||
        result.questions.length !== questionCount
      ) {
        setError("The quiz server returned an incomplete question set. Please retry.");
        setStarting(false);
        return;
      }

      setSessionId(result.sessionId);
      setQuizQuestions(result.questions as QuizQuestion[]);
      setCurrent(0);
      setAnswers({});
      setQuizStarted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  async function submitQuiz() {
    if (submitting || !sessionId || Object.keys(answers).length !== quizQuestions.length) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, answers })
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Could not submit this quiz.");
        setSubmitting(false);
        return;
      }

      router.push("/result/" + result.attemptId);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (!quizStarted) {
    return (
      <section className="panel quiz-question">
        <div className="quiz-top">
          <span className="eyebrow">{subjectName}</span>
          <span>{availableQuestionCount} questions available</span>
        </div>
        <div className="question-kicker">CUSTOMIZE YOUR QUIZ</div>
        <h1>How many questions do you want to attempt?</h1>
        <p className="muted">
          Choose your quiz length. The server will randomly select questions and shuffle the options.
        </p>
        <div
          role="radiogroup"
          aria-label="Number of questions"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
            margin: "24px 0"
          }}
        >
          {QUESTION_COUNTS.map((count) => {
            const disabled = count > availableQuestionCount;
            const selected = questionCount === count;
            return (
              <button
                key={count}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={count + " questions"}
                className={"button" + (selected ? "" : " button-quiet")}
                disabled={disabled || starting}
                onClick={() => setQuestionCount(count)}
                style={{ opacity: disabled ? 0.4 : 1, minWidth: 0 }}
              >
                {count}
              </button>
            );
          })}
        </div>
        {availableCounts.length === 0 && (
          <p className="notice notice-error">
            At least 10 published questions with answer keys are required to start a quiz.
          </p>
        )}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <button
          className="button"
          type="button"
          onClick={startQuiz}
          disabled={starting || questionCount === 0}
        >
          {starting ? "Preparing quiz..." : "Start quiz →"}
        </button>
      </section>
    );
  }

  const question = quizQuestions[current];
  const answered = Object.keys(answers).length;
  const progress = Math.round(((current + 1) / quizQuestions.length) * 100);

  if (!question) return null;

  return (
    <section className="panel quiz-question">
      <div className="quiz-top">
        <span className="eyebrow">{subjectName}</span>
        <span>Question {current + 1} of {quizQuestions.length}</span>
      </div>
      <div className="quiz-progress"><span style={{ width: progress + "%" }} /></div>
      <div className="question-kicker">SELECT ONE OPTION</div>
      <h1>{question.question_text}</h1>
      <div role="radiogroup" aria-label="Answer options">
        {question.options.map((option) => (
          <label
            className={"quiz-option" + (answers[question.id] === option.token ? " active" : "")}
            key={option.token}
          >
            <input
              type="radio"
              name={"question-" + question.id}
              value={option.token}
              checked={answers[question.id] === option.token}
              onChange={() =>
                setAnswers((previous) => ({ ...previous, [question.id]: option.token }))
              }
            />
            <strong>{option.label}.</strong>
            <span>{option.text}</span>
          </label>
        ))}
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <div className="quiz-controls">
        <button
          className="button button-quiet"
          type="button"
          onClick={() => setCurrent((value) => Math.max(0, value - 1))}
          disabled={current === 0 || submitting}
        >
          Previous
        </button>
        {current < quizQuestions.length - 1 ? (
          <button
            className="button"
            type="button"
            onClick={() => setCurrent((value) => value + 1)}
            disabled={submitting}
          >
            Next question →
          </button>
        ) : (
          <button
            className="button"
            type="button"
            onClick={submitQuiz}
            disabled={submitting || answered !== quizQuestions.length}
          >
            {submitting ? "Submitting..." : "Submit quiz"}
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: 16 }}>
        {answered} of {quizQuestions.length} answered. Answer every question to submit.
      </p>
    </section>
  );
}
