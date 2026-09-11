import type { Metadata, Viewport } from "next";
import { AudioCacheLifecycle } from "./audio-cache-scope";
import { OfflineShellRegistration } from "./offline-shell-registration";
import { ActionableDialogProvider } from "./actionable-dialog";
import "./globals.css";
import "@fontsource-variable/nunito";
import "@fontsource-variable/quicksand";
import "@fontsource-variable/noto-sans-kr";
import "@fontsource-variable/noto-sans-jp";

export const metadata: Metadata = {
  title: "Meta Shadowing",
  description: "개인 문장으로 여덟 단계 학습 · 다운로드한 레슨의 레벨 1은 오프라인 학습 가능",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Meta Shadowing" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/180", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body><ActionableDialogProvider><AudioCacheLifecycle /><OfflineShellRegistration />{children}</ActionableDialogProvider></body>
    </html>
  );
}
