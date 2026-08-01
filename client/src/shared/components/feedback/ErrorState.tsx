import { AlertTriangleIcon } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { ApiError } from "@/shared/services/api";

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : "Something went wrong.";

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/40 py-16 text-center">
      <AlertTriangleIcon className="mb-2 size-8 text-destructive" />
      <p className="text-sm font-medium text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}
