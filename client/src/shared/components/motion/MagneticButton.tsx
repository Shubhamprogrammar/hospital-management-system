"use client";

import * as React from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

import { cn } from "@/shared/lib/utils";

interface MagneticButtonProps extends React.ComponentProps<"button"> {
  /** Radius in px within which the button is pulled toward the cursor. */
  strength?: number;
}

/**
 * GSAP magnetic hover button — the element eases toward the cursor inside a
 * bounded radius and springs back on leave. Respects reduced motion.
 */
export function MagneticButton({ children, className, strength = 24, ...props }: MagneticButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const prefersReduced =
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReduced) return;

      const xTo = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3.out" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3.out" });

      const onMove = (e: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > strength) return;
        const pull = 1 - dist / strength;
        xTo(dx * 0.35 * pull);
        yTo(dy * 0.35 * pull);
      };

      const onLeave = () => {
        xTo(0);
        yTo(0);
      };

      el.addEventListener("mousemove", onMove);
      el.addEventListener("mouseleave", onLeave);
      return () => {
        el.removeEventListener("mousemove", onMove);
        el.removeEventListener("mouseleave", onLeave);
      };
    },
    { scope: ref },
  );

  return (
    <button ref={ref} className={cn("will-change-transform", className)} {...props}>
      {children}
    </button>
  );
}
