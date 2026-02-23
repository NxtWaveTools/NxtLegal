'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { logger } from '@/core/infra/logging/logger'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log error to monitoring service
    logger.error('Route error boundary triggered', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    })
  }, [error])

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        background: 'var(--color-background)',
        animation: 'fadeIn 0.5s ease',
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--color-shadow-lg)',
          animation: 'fadeInUp 0.5s ease both',
        }}
      >
        <div className="mb-4 flex items-center gap-3">
          <div
            className="rounded-full p-3"
            style={{
              background: 'rgba(220, 38, 38, 0.08)',
              animation: 'gentleBounce 2s ease-in-out infinite',
            }}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
              style={{ color: 'var(--color-danger)' }}
            >
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
            Something went wrong
          </h2>
        </div>

        <p className="mb-6" style={{ color: 'var(--color-text-muted)' }}>
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>

        <div className="flex gap-4">
          <button
            onClick={() => reset()}
            className="flex-1 rounded-xl px-4 py-2 font-semibold"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-accent-contrast)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              boxShadow: '0 4px 14px rgba(47, 109, 246, 0.2)',
            }}
          >
            Try again
          </button>
          <Link
            href="/"
            className="flex-1 rounded-xl px-4 py-2 text-center font-semibold"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              transition: 'transform 0.2s ease, border-color 0.2s ease',
            }}
          >
            Go home
          </Link>
        </div>

        {error.digest && (
          <p className="mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
