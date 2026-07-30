import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
      <h2 className="text-2xl font-semibold">Page not found</h2>
      <p className="mt-2 text-sm text-slate-300">
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-200"
      >
        Go home
      </Link>
    </div>
  );
}
