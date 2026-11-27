import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CU Quiz | Chandigarh University",
  description: "Subject-wise MCQ practice for Chandigarh University students."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
