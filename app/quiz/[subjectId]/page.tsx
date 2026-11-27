import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import QuizClient, { type QuizQuestion } from "./quiz-client";

type Props = { params: Promise<{ subjectId: string }> };
type OptionKey = "A" | "B" | "C" | "D";

const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];

function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

export default async function QuizPage({ params }: Props) {
  const { subjectId } = await params;
  const { supabase } = await requireUser();

  const { data: subject } = await supabase
    .from("subjects")
    .select("id, name, description")
    .eq("id", subjectId)
    .eq("is_active", true)
    .maybeSingle();

  if (!subject) notFound();

  const { data: questions, error } = await supabase
    .from("questions")
    .select("id, question_text, option_a, option_b, option_c, option_d")
    .eq("subject_id", subjectId)
    .eq("is_published", true)
    .limit(20);

  if (error) {
    return <main className="quiz-wrap"><div className="panel"><h1>Could not load quiz</h1><p className="muted">{error.message}</p><Link href="/dashboard">Back to subjects</Link></div></main>;
  }

  if (!questions || questions.length === 0) {
    return <main className="quiz-wrap"><div className="panel"><h1>No questions yet</h1><p className="muted">The admin has not added questions for {subject.name} yet.</p><Link href="/dashboard">Back to subjects</Link></div></main>;
  }

  const quizQuestions: QuizQuestion[] = shuffleArray(questions).map((question) => {
    const shuffledOptions = shuffleArray([
      { sourceKey: "A" as const, text: question.option_a },
      { sourceKey: "B" as const, text: question.option_b },
      { sourceKey: "C" as const, text: question.option_c },
      { sourceKey: "D" as const, text: question.option_d }
    ]);

    return {
      id: question.id,
      question_text: question.question_text,
      options: shuffledOptions.map((option, index) => ({
        key: OPTION_KEYS[index],
        sourceKey: option.sourceKey,
        text: option.text
      }))
    };
  });

  return (
    <main className="quiz-wrap">
      <div className="quiz-top"><Link href="/dashboard">← All subjects</Link><span>{subject.name}</span></div>
      <QuizClient subjectId={subject.id} subjectName={subject.name} questions={quizQuestions} />
    </main>
  );
}
