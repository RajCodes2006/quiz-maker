import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import QuizClient from "./quiz-client";

type Props = { params: Promise<{ subjectId: string }> };

export default async function QuizPage({ params }: Props) {
  const { subjectId } = await params;
  const { supabase } = await requireUser();

  const { data: subject, error: subjectError } = await supabase
    .from("subjects")
    .select("id, name, description")
    .eq("id", subjectId)
    .eq("is_active", true)
    .maybeSingle();

  if (subjectError || !subject) notFound();

  // Count the full published pool; the server chooses the requested random subset.
  const { count, error: questionError } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("subject_id", subjectId)
    .eq("is_published", true);

  if (questionError) {
    return (
      <main className="quiz-wrap">
        <div className="panel">
          <h1>Could not load quiz</h1>
          <p className="muted">The question bank could not be checked. Please reload the page.</p>
          <Link href="/dashboard">Back to subjects</Link>
        </div>
      </main>
    );
  }

  const availableQuestionCount = count ?? 0;

  if (availableQuestionCount === 0) {
    return (
      <main className="quiz-wrap">
        <div className="panel">
          <h1>No questions yet</h1>
          <p className="muted">
            The admin has not added questions for {subject.name} yet.
          </p>
          <Link href="/dashboard">Back to subjects</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="quiz-wrap">
      <div className="quiz-top">
        <Link href="/dashboard">← All subjects</Link>
        <span>{subject.name}</span>
      </div>
      <QuizClient
        subjectId={subject.id}
        subjectName={subject.name}
        availableQuestionCount={availableQuestionCount}
      />
    </main>
  );
}
