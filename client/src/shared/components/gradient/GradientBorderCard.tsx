import { cn } from "@/shared/lib/utils";

interface GradientBorderCardProps {
  children: React.ReactNode;
  className?: string;
  /** Extra gradient shift animation on hover. */
  animated?: boolean;
}

/** Gradient-border card via the padding-box/border-box double-background trick. */
export function GradientBorderCard({ children, className, animated = false }: GradientBorderCardProps) {
  return (
    <div
      className={cn(
        "border-gradient-brand rounded-xl",
        animated &&
          "transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_20px_60px_-20px_var(--glow-primary)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
