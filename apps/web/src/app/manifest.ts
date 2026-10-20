import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ZomatoFresh — Food Delivery",
    short_name: "ZomatoFresh",
    description: "Order food from restaurants near you with live tracking.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFFFF",
    theme_color: "#D92D47",
    categories: ["food", "shopping", "lifestyle"],
    lang: "en-IN",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My orders", short_name: "Orders", url: "/account?tab=orders", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Search food", short_name: "Search", url: "/search", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
