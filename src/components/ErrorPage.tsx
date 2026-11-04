// The page shown when something breaks. A page that failed to download (often
// offline) says so; anything else says it went wrong. Either way your data is
// safe, Retry tries again and Home is one tap away. Plain links, no router, so
// it also works above the router.

const isLoadFailure = (error: unknown) =>
  /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk|Failed to fetch/i.test(
    String((error as Error)?.message ?? error),
  )

export default function ErrorPage({
  error,
  onRetry,
  fullScreen = false,
}: {
  error: unknown
  onRetry: () => void
  fullScreen?: boolean
}) {
  const loadFailure = isLoadFailure(error)
  const retry = () => (loadFailure ? window.location.reload() : onRetry())
  return (
    <div
      role="alert"
      data-testid="error-page"
      className={`flex flex-col items-center justify-center gap-5 px-4 text-center ${fullScreen ? 'min-h-screen' : 'py-20'}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-edge bg-card text-accent" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{loadFailure ? 'This page didn’t load' : 'Something went wrong'}</h1>
        <p className="mx-auto mt-2 max-w-md text-slate-400">
          {loadFailure
            ? 'Part of the app couldn’t be downloaded, often because the connection dropped. Your workouts and settings are safe.'
            : 'This screen hit an error. Your workouts and settings are safe, and the problem was reported.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={retry}
          className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-slate-900 transition hover:opacity-90"
        >
          Retry
        </button>
        <a
          href="/"
          className="rounded-xl border border-edge bg-card px-5 py-2.5 font-medium text-slate-200 transition hover:bg-card-hover"
        >
          Home
        </a>
      </div>
    </div>
  )
}
