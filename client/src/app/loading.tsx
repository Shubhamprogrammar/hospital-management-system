export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-white" />
        <p className="text-sm text-slate-300">Loading...</p>
      </div>
    </div>
  );
}
