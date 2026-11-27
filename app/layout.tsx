import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import ThemeToggle from "@/components/theme-toggle";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "CU Quiz | Chandigarh University",
  description: "Subject-wise MCQ practice for Chandigarh University students."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme-initializer" strategy="beforeInteractive">
          {`try {
            var savedTheme = localStorage.getItem("cu-quiz-theme");
            var systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            document.documentElement.dataset.theme = savedTheme || (systemPrefersDark ? "dark" : "light");
          } catch (error) {
            document.documentElement.dataset.theme = "light";
          }`}
        </Script>
        {children}
        <ThemeToggle />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
