// src/app/layout.tsx

import type { Metadata } from "next";
import "./globals.css";
import "@/core/types"; // Import core types globally for context

export const metadata: Metadata = {
  title: "Smart Home Hub",
  description: "A local-first, resilient smart home control panel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}