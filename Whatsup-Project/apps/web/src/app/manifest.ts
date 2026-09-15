import type { MetadataRoute } from "next";

// Installed-app identity. Partner white-label overrides the in-app logo and tab favicon
// at runtime, but an installed PWA is pinned at install time, so this stays the platform
// mark rather than pretending to be per-partner.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Loqio",
    short_name: "Loqio",
    description: "WhatsApp Business messaging platform",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0b0d12",
    theme_color: "#059669",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
