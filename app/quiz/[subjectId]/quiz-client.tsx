"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type OptionKey = "A" | "B" | "C" | "D";
const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];
const QUESTION_COUNTS = [10, 20, 40, 80] as const;

export type QuizQuestion = {
  id: string;
  question_text: string;
  options: { key: OptionKey; sourceKey: OptionKey; text: string }[];
};

type Props = {
  subjectId: string;
  subjectName: string;
  questions: QuizQuestion[];
};

function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

export default function QuizClient({ subjectId, subjectName, questions }: Props) {
  const router = useRouter();
  const availableCounts = QUESTION_COUNTS.filter((count) => count <= questions.length);
  const [questionCount, setQuestionCount] = useState<number>(availableCounts[0] ?? 0);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function startQuiz() {
    if (!availableCounts.includes(questionCount as (typeof QUESTION_COUNTS)[number])) return;

    // Randomly select the requested number of unique questions, then shuffle each question's options.
    const selectedQuestions = shuffleArray(questions)
      .slice(0, questionCount)
      .map((item) => {
        const shuffledOptions = shuffleArray(item.options);
        return {
          ...item,
          options: shuffledOptions.map((option, index) => ({
            ...option,
            key: OPTION_KEYS[index]
          }))
        };
      });

    setQuizQuestions(selectedQuestions);
    setCurrent(0);
    setAnswers({});
    setError("");
    setQuizStarted(true);
  }

  async function submitQuiz() {
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          questionIds: quizQuestions.map((item) => item.id),
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

  if (!quizStarted) {
    return (
      <section className="panel quiz-question">
        <div className="quiz-top">
          <span className="eyebrow">{subjectName}</span>
          <span>{questions.length} questions available</span>
        </div>
        <div className="question-kicker">CUSTOMIZE YOUR QUIZ</div>
        <h1>How many questions do you want to attempt?</h1>
        <p className="muted">Choose your quiz length. Questions and options will be randomized.</p>
        <div
          role="radiogroup"
          aria-label="Number of questions"
          style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, margin: "24px 0" }}
        >
          {QUESTION_COUNTS.map((count) => {
            const disabled = count > questions.length;
            const selected = questionCount === count;
            return (
              <button
                key={count}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={count + " questions"}
                className={"button" + (selected ? "" : " button-quiet")}
                disabled={disabled}
                onClick={() => setQuestionCount(count)}
                style={{ opacity: disabled ? 0.4 : 1, minWidth: 0 }}
              >
                {count}
              </button>
            );
          })}
        </div>
        {availableCounts.length === 0 && (
          <p className="notice notice-error">At least 10 published questions are required to start a quiz.</p>
        )}
        <button className="button" type="button" onClick={startQuiz} disabled={questionCount === 0}>
          Start quiz →
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
          <label className={"quiz-option" + (answers[question.id] === option.sourceKey ? " active" : "")} key={option.key}>
            <input
              type="radio"
              name={"question-" + question.id}
              value={option.key}
              checked={answers[question.id] === option.sourceKey}
              onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: option.sourceKey }))}
            />
            <strong>{option.key}.</strong>
            <span>{option.text}</span>
          </label>
        ))}
      </div>
      {error && <div className="notice notice-error">{error}</div>}
      <div className="quiz-controls">
        <button className="button button-quiet" type="button" onClick={() => setCurrent((value) => Math.max(0, value - 1))} disabled={current === 0}>Previous</button>
        {current < quizQuestions.length - 1 ? (
          <button className="button" type="button" onClick={() => setCurrent((value) => value + 1)}>Next question →</button>
        ) : (
          <button className="button" type="button" onClick={submitQuiz} disabled={submitting || answered !== quizQuestions.length}>
            {submitting ? "Submitting..." : "Submit quiz"}
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: 16 }}>{answered} of {quizQuestions.length} answered. Answer every question to submit.</p>
    </section>
  );
}
