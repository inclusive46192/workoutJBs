import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Momentum Journal",
    short_name: "Momentum",
    description: "Morgenroutine PWA mit Cloud-Sync und Offline-Lite-Modus.",
    start_url: "/",
    display: "standalone",
    background_color: "#ecfeff",
    theme_color: "#0f766e",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
    ],
  };
}
