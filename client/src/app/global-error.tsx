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
      <body className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-900/80 p-8 text-center shadow-xl">
          <h2 className="text-2xl font-semibold">A critical error occurred</h2>
          <p className="mt-2 text-sm text-slate-300">
            The application hit an unexpected issue. Please refresh or try again.
          </p>
          <button
            onClick={reset}
            className="mt-6 rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-200"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
