import type { Metadata } from "next";
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
      <body className="min-h-full flex flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
