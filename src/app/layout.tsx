import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meta Shadowing",
  description: "Private beta learner shell",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Meta Shadowing" }
};

export const viewport: Viewport = {
  themeColor: "#0d1216",
  colorScheme: "dark"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
