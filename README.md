# CU Quiz Platform

A subject-wise MCQ practice platform for Chandigarh University. Students can practise published quizzes and review their scores; admins maintain subjects, questions, and answer keys.

## Tech stack

- Next.js 16 App Router + TypeScript
- Supabase Auth with cookie-based SSR sessions
- Supabase PostgreSQL + Row Level Security
- Vercel hosting
- No separate Render service is needed for this starter

## Features in this starter

- Student registration and email/password login
- One Supabase Auth system with role-based admin/student routing
- Admin dashboard to create subjects and four-option MCQs
- Separate answer-key table so students cannot query correct answers
- Student dashboard showing active subjects and recent attempts
- One-question-at-a-time quiz flow
- Server-side scoring and saved quiz results
- RLS policies for profiles, subjects, questions, answer keys, attempts, and responses

## 1. Run locally

Use Node.js 22 or later.

1. Clone the repository.
2. Install dependencies with npm install.
3. Copy .env.example to .env.local.
4. Add your Supabase project URL and publishable key.
5. Set NEXT_PUBLIC_SITE_URL to http://localhost:3000 for local development.
6. Add a server-only Supabase secret key as SUPABASE_SECRET_KEY.
7. Run the SQL in supabase/schema.sql in the Supabase SQL Editor.
8. Start the app with npm run dev and open http://localhost:3000.

Required environment variables:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- NEXT_PUBLIC_SITE_URL
- SUPABASE_SECRET_KEY (server-only; needed for scoring and result storage)

Do not put the Supabase secret/service-role key in any NEXT_PUBLIC_ variable or commit it to GitHub.

## 2. Configure Supabase

Create a Supabase project, then run supabase/schema.sql in the SQL Editor. Check the project's Data API settings and make sure the public schema is exposed to the API. The SQL applies explicit grants and enables RLS on every app table.

In Authentication settings, configure the Site URL and redirect URLs for local development and the deployed Vercel domain. The callback route is /auth/callback.

New registrations are always students. The signup form does not accept a role value.

## 3. Promote the first admin

1. Register your own account through the app.
2. Confirm your email if email confirmation is enabled.
3. In the Supabase SQL Editor, run the following query after replacing the email:

    update public.profiles
    set role = 'admin'
    where id = (select id from auth.users where email = 'your-admin-email@example.com');

4. Sign out and sign in again. Your account should route to /admin.

Only the database owner should promote admins. Never expose the role update operation in the student UI.

## 4. Deploy to Vercel

Import this GitHub repository into Vercel and add the same environment variables in Project Settings → Environment Variables. Set NEXT_PUBLIC_SITE_URL to the production URL and deploy the main branch. Add the Vercel production URL and preview URLs to Supabase Auth's allowed redirect URLs.

No Render backend is required right now. Next.js route handlers run on Vercel and perform quiz scoring with the server-only Supabase key.

## Important security notes

- Correct answers live in question_answers, not in the questions table returned to students.
- The student-facing browser only receives the Supabase publishable key.
- SUPABASE_SECRET_KEY is used only in trusted server-side code for scoring and storing results.
- RLS is enabled on all public app tables.
- Never disable RLS to fix an access problem. Check the grants and policies instead.

## Current starter limitations

- Admins can add subjects and questions; editing/deleting content and bulk CSV upload are not included yet.
- Quizzes currently show up to 20 published questions for a subject.
- All displayed questions must be answered before submission.
- No timer, randomized question order, leaderboard, or analytics yet.
