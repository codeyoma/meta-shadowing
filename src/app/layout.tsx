import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@fontsource-variable/nunito";
import "@fontsource-variable/quicksand";
import "@fontsource-variable/noto-sans-kr";
import "@fontsource-variable/noto-sans-jp";

export const metadata: Metadata = {
  title: "Meta Shadowing",
  description: "개인 문장으로 여덟 단계 학습 · 인터넷 연결이 필요한 온라인 전용 앱",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Meta Shadowing" },
  icons: { apple: [{ url: "/icons/180", sizes: "180x180", type: "image/png" }] }
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
