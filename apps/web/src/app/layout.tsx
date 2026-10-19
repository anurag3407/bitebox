import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZomatoFresh — Food Delivery Platform",
  description: "Authentic Indian food delivery in 25-35 minutes. Fast, transparent, and delicious.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-brand selection:text-white">
        {children}
      </body>
    </html>
  );
}
