import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-5 w-1 rounded-full bg-gradient-brand" />
          <h1 className="text-2xl font-semibold tracking-tight md:text-[1.7rem]">{title}</h1>
        </div>
        {description && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
