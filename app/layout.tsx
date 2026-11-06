import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "../agent folder/assistant.css";

export const metadata: Metadata = {
  title: "Namma Mobility — Your Voice. Your City. Your Journey.",
  description:
    "A voice-first Chennai public transport assistant in Tamil and English.",
  applicationName: "Namma Mobility",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </head>
      <body>
        {children}
        <Script src="/api/agent-widget" strategy="afterInteractive" />
      </body>
    </html>
  );
}
