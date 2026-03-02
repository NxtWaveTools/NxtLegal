'use client'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4">
          <div className="w-full max-w-md text-center">
            <h1 className="mb-4 text-6xl font-bold text-white">500</h1>
            <h2 className="mb-4 text-2xl font-semibold text-white">Critical Error</h2>
            <p className="mb-8 text-gray-400">A critical error occurred. Please refresh the page.</p>
            <button
              onClick={() => reset()}
              className="rounded-md bg-white px-6 py-3 text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900"
            >
              Reload Page
            </button>
            {error.digest && <p className="mt-4 text-xs text-gray-600">Error ID: {error.digest}</p>}
          </div>
        </div>
      </body>
    </html>
  )
}
