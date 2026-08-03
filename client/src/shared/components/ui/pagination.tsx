import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import type { PaginationMeta } from "@/shared/types";

interface PaginationBarProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  className?: string;
}

export function PaginationBar({ meta, onPageChange, className }: PaginationBarProps) {
  const { page, totalPages, totalItems } = meta;

  if (totalItems === 0) return null;

  return (
    <div className={cn("flex items-center justify-between gap-4 text-sm text-muted-foreground", className)}>
      <span>
        Page {page} of {Math.max(totalPages, 1)} &middot; {totalItems} total
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
