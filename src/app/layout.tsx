import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EPSO AI Trainer",
  description: "Personal study trainer for EPSO/AD/430/26 (AD8, AI)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
