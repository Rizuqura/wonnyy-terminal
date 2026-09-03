import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wonnyy — Research Workspace",
  description: "Amadeus research workspace prototype",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
