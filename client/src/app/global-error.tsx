'use client';

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--background)] px-6 py-10 text-[var(--foreground)]">
        <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-xl">
          <h2 className="text-2xl font-semibold">A critical error occurred</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            The application hit an unexpected issue. Please refresh or try again.
          </p>
          <button
            onClick={reset}
            className="mt-6 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] transition hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
