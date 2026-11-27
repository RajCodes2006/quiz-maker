"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type QuizQuestion = {
  id: string;
  question_text: string;
  options: { key: "A" | "B" | "C" | "D"; text: string }[];
};

type Props = {
  subjectId: string;
  subjectName: string;
  questions: QuizQuestion[];
};

export default function QuizClient({ subjectId, subjectName, questions }: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const question = questions[current];
  const answered = Object.keys(answers).length;
  const progress = Math.round(((current + 1) / questions.length) * 100);

  async function submitQuiz() {
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          questionIds: questions.map((item) => item.id),
          answers
        })
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

  if (!question) return null;

  return (
    <section className="panel quiz-question">
      <div className="quiz-top">
        <span className="eyebrow">{subjectName}</span>
        <span>Question {current + 1} of {questions.length}</span>
      </div>
      <div className="quiz-progress"><span style={{ width: progress + "%" }} /></div>
      <div className="question-kicker">SELECT ONE OPTION</div>
      <h1>{question.question_text}</h1>
      <div role="radiogroup" aria-label="Answer options">
        {question.options.map((option) => (
          <label className={"quiz-option" + (answers[question.id] === option.key ? " active" : "")} key={option.key}>
            <input
              type="radio"
              name={"question-" + question.id}
              value={option.key}
              checked={answers[question.id] === option.key}
              onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: option.key }))}
            />
            <strong>{option.key}.</strong>
            <span>{option.text}</span>
          </label>
        ))}
      </div>
      {error && <div className="notice notice-error">{error}</div>}
      <div className="quiz-controls">
        <button className="button button-quiet" type="button" onClick={() => setCurrent((value) => Math.max(0, value - 1))} disabled={current === 0}>Previous</button>
        {current < questions.length - 1 ? (
          <button className="button" type="button" onClick={() => setCurrent((value) => value + 1)}>Next question →</button>
        ) : (
          <button className="button" type="button" onClick={submitQuiz} disabled={submitting || answered !== questions.length}>
            {submitting ? "Submitting..." : "Submit quiz"}
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: 16 }}>{answered} of {questions.length} answered. Answer every question to submit.</p>
    </section>
  );
}
