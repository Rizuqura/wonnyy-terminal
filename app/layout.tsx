import type { Metadata } from "next";
import "./globals.css";
import "../features/chat/chat.css";
import "../features/model-settings/model-settings.css";
import "../features/dialogs/confirmation.css";

export const metadata: Metadata = {
  title: "Wonnyy — Amadeus 0.0.6",
  description: "Amadeus research workspace prototype",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
