import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meta Shadowing",
    short_name: "Meta Shadowing",
    description: "Private beta learner shell",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1216",
    theme_color: "#0d1216",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }]
  };
}
