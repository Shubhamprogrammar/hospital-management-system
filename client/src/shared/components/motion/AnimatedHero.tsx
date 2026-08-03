"use client";

import * as React from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

import { cn } from "@/shared/lib/utils";

gsap.registerPlugin(ScrollTrigger);

interface AnimatedHeroProps {
  children: React.ReactNode;
  className?: string;
  /** Stagger delay between children (seconds). */
  stagger?: number;
}

/**
 * GSAP + ScrollTrigger reveal wrapper. Splits direct text children into words
 * and animates them up with a blur-to-sharp transition; other children fade/slide.
 * Reduced-motion users get instant end-state.
 */
export function AnimatedHero({ children, className, stagger = 0.08 }: AnimatedHeroProps) {
  const scope = React.useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;

      const prefersReduced =
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const words = root.querySelectorAll<HTMLElement>("[data-split]");
      const items = root.querySelectorAll<HTMLElement>("[data-reveal]");

      if (prefersReduced) {
        words.forEach((w) => {
          w.style.opacity = "1";
          w.style.filter = "blur(0px)";
          w.style.transform = "none";
        });
        items.forEach((i) => {
          i.style.opacity = "1";
          i.style.transform = "none";
        });
        return;
      }

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
      });

      if (words.length) {
        tl.fromTo(
          words,
          { y: 60, opacity: 0, filter: "blur(12px)" },
          { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.9, ease: "power3.out", stagger },
        );
      }

      tl.fromTo(
        items,
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, ease: "power3.out", stagger: stagger * 1.5 },
        words.length ? "-=0.4" : 0,
      );
    },
    { scope },
  );

  return (
    <div ref={scope} className={cn("relative", className)}>
      {children}
    </div>
  );
}

/** Wrap a heading's key words with this to trigger the word-split reveal. */
export function SplitWords({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split(" ").map((word, i) => (
        <span
          key={`${word}-${i}`}
          data-split
          className={cn("inline-block will-change-transform", className)}
        >
          {word}
          {i < text.split(" ").length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </>
  );
}
