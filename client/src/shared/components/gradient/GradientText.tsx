import { cn } from "@/shared/lib/utils";

interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  as?: "span" | "h1" | "h2" | "h3" | "p";
}

/** Signature gradient text — applies `text-gradient-brand` from the design tokens. */
export function GradientText({ children, className, as: Comp = "span" }: GradientTextProps) {
  return <Comp className={cn("text-gradient-brand", className)}>{children}</Comp>;
}
