import Link from "next/link";
import { signOut } from "@/app/actions";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createQuestion, createSubject, importQuestionsCsv } from "@/app/admin/actions";

type Props = { searchParams: Promise<{ error?: string; message?: string }> };

export default async function AdminPage({ searchParams }: Props) {
  const { profile, user, supabase } = await requireAdmin();
  const params = await searchParams;
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name, description, is_active")
    .order("name");

  const admin = createAdminClient();
  const { count: questionCount } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true });

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <Link className="brand" href="/"><span className="brand-mark">CU</span><span>CU Quiz · Admin</span></Link>
          <h1 className="page-heading" style={{ marginTop: 28 }}>Admin workspace</h1>
          <p className="page-subtitle">Manage subjects and maintain the MCQ question bank.</p>
        </div>
        <div className="app-header-actions">
          <span className="muted">{profile?.full_name || user.email}</span>
          <form action={signOut}><button className="button button-quiet button-small" type="submit">Sign out</button></form>
        </div>
      </header>

      {params.error && <div className="notice notice-error">{params.error}</div>}
      {params.message && <div className="notice">{params.message}</div>}

      <section className="grid-2">
        <div className="panel">
          <h2>Question bank overview</h2>
          <div className="result-metrics">
            <div className="metric"><strong>{subjects?.length ?? 0}</strong><span>Subjects</span></div>
            <div className="metric"><strong>{questionCount ?? 0}</strong><span>Questions</span></div>
            <div className="metric"><strong>4</strong><span>Options per question</span></div>
          </div>
          <p className="muted">New questions are published immediately and become available to students.</p>
        </div>

        <div className="panel">
          <h2>Add a subject</h2>
          <form action={createSubject}>
            <div className="field"><label htmlFor="subject-name">Subject name</label><input id="subject-name" name="name" placeholder="e.g. Advanced Data Structures" required /></div>
            <div className="field"><label htmlFor="subject-description">Description</label><textarea id="subject-description" name="description" placeholder="A short description (optional)" /></div>
            <button className="button" type="submit">Create subject</button>
          </form>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <h2>Import many questions</h2>
        <p className="muted">
          Upload a CSV to add up to 500 MCQs to one subject at once. Every row must include
          the question, options A–D, and the correct option. Nothing is imported if any row is invalid.
        </p>
        {subjects && subjects.length > 0 ? (
          <form action={importQuestionsCsv}>
            <div className="field">
              <label htmlFor="bulk-question-subject">Subject for these questions</label>
              <select id="bulk-question-subject" name="subject_id" required defaultValue="">
                <option value="" disabled>Select a subject</option>
                {subjects.map((subject) => (
                  <option value={subject.id} key={subject.id}>{subject.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="questions-csv">CSV file</label>
              <input id="questions-csv" name="csv_file" type="file" accept=".csv,text/csv" required />
            </div>
            <div className="app-header-actions" style={{ justifyContent: "flex-start", gap: 12 }}>
              <button className="button" type="submit">Upload questions</button>
              <a className="button button-quiet" href="/question-template.csv" download>
                Download CSV template
              </a>
            </div>
          </form>
        ) : (
          <div className="empty-state">Create a subject first, then import questions into it.</div>
        )}
        <p className="muted" style={{ marginTop: 14 }}>
          Required CSV columns: question_text, option_a, option_b, option_c, option_d, correct_option.
          Use A, B, C, or D in the correct_option column.
        </p>
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <h2>Add an MCQ</h2>
        {subjects && subjects.length > 0 ? (
          <form action={createQuestion}>
            <div className="field"><label htmlFor="question-subject">Subject</label>
              <select id="question-subject" name="subject_id" required defaultValue="">
                <option value="" disabled>Select a subject</option>
                {subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="question-text">Question</label><textarea id="question-text" name="question_text" placeholder="Write the question..." required /></div>
            <div className="form-row">
              <div className="field"><label htmlFor="option-a">Option A</label><input id="option-a" name="option_a" required /></div>
              <div className="field"><label htmlFor="option-b">Option B</label><input id="option-b" name="option_b" required /></div>
              <div className="field"><label htmlFor="option-c">Option C</label><input id="option-c" name="option_c" required /></div>
              <div className="field"><label htmlFor="option-d">Option D</label><input id="option-d" name="option_d" required /></div>
            </div>
            <div className="field" style={{ maxWidth: 260 }}><label htmlFor="correct-option">Correct option</label>
              <select id="correct-option" name="correct_option" defaultValue="A">
                <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
              </select>
            </div>
            <button className="button" type="submit">Save question</button>
          </form>
        ) : (
          <div className="empty-state">Create a subject first. You can then add questions to it.</div>
        )}
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <h2>Subjects</h2>
        {subjects && subjects.length > 0 ? (
          <div className="table-scroll">
            <table className="table-list">
              <thead><tr><th>Subject</th><th>Description</th><th>Status</th></tr></thead>
              <tbody>{subjects.map((subject) => (
                <tr key={subject.id}>
                  <td><strong>{subject.name}</strong></td>
                  <td>{subject.description || "—"}</td>
                  <td>{subject.is_active ? "Active" : "Hidden"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="empty-state">No subjects yet.</div>}
      </section>
    </main>
  );
}
