import type { Metadata } from "next";
import Script from "next/script";
import Provider from "./provider";
import { fontVariables } from "@/shared/config/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hospital Management System",
  description: "Unified staff portal for patients, appointments, billing, and care coordination.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Apply persisted theme before paint to avoid a flash of the wrong theme.
            next/script with beforeInteractive inlines this in the initial HTML
            head (same behavior as a raw <script>, without React's warning). */}
        <Script
          id="hms-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("hms-theme");var r=document.documentElement;var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var resolved=t==="dark"?"dark":t==="light"?"light":(d?"dark":"light");r.classList.toggle("dark",resolved==="dark");r.setAttribute("data-theme",resolved);r.style.colorScheme=resolved;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
