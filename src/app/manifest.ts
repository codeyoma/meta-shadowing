import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meta Shadowing",
    short_name: "Meta Shadowing",
    description: "개인 문장으로 여덟 단계 학습 · 인터넷 연결이 필요한 온라인 전용 앱",
    id: "/",
    scope: "/",
    lang: "ko",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [192, 512].map(size => ({ src: `/icons/${size}`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" }))
  };
}
