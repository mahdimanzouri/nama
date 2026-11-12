import { PLATFORM_LIMITS, PLATFORM_NAME, SUPPORTED_LOCALES } from "@nama/dashboard-types";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <header>
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          workspace foundation
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{PLATFORM_NAME}</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          This route resolves{" "}
          <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
            @nama/dashboard-types
          </code>{" "}
          from the pnpm workspace. The dashboard SDK and API are built on this foundation.
        </p>
      </header>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-black/[.08] p-3 dark:border-white/[.145]">
          <dt className="text-zinc-500">Locales</dt>
          <dd className="mt-1 font-mono">{SUPPORTED_LOCALES.join(", ")}</dd>
        </div>
        <div className="rounded-lg border border-black/[.08] p-3 dark:border-white/[.145]">
          <dt className="text-zinc-500">Max widgets</dt>
          <dd className="mt-1 font-mono">{PLATFORM_LIMITS.maxWidgets}</dd>
        </div>
        <div className="rounded-lg border border-black/[.08] p-3 dark:border-white/[.145]">
          <dt className="text-zinc-500">Query timeout</dt>
          <dd className="mt-1 font-mono">{PLATFORM_LIMITS.queryTimeoutMs / 1000}s</dd>
        </div>
      </dl>
    </main>
  );
}
