import { Geist, Geist_Mono, Inter } from "next/font/google";

export const fontSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const fontMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const fontBody = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const fontVariables = `${fontSans.variable} ${fontMono.variable} ${fontBody.variable}`;
