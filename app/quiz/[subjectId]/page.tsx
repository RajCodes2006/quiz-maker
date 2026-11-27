import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import QuizClient, { type QuizQuestion } from "./quiz-client";

type Props = { params: Promise<{ subjectId: string }> };

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

  const quizQuestions: QuizQuestion[] = questions.map((question) => ({
    id: question.id,
    question_text: question.question_text,
    options: [
      { key: "A", text: question.option_a },
      { key: "B", text: question.option_b },
      { key: "C", text: question.option_c },
      { key: "D", text: question.option_d }
    ]
  }));

  return (
    <main className="quiz-wrap">
      <div className="quiz-top"><Link href="/dashboard">← All subjects</Link><span>{subject.name}</span></div>
      <QuizClient subjectId={subject.id} subjectName={subject.name} questions={quizQuestions} />
    </main>
  );
}
