import Link from 'next/link'

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: 'var(--color-background)',
        color: 'var(--color-text)',
        animation: 'fadeIn 0.5s ease',
      }}
    >
      <div className="max-w-md w-full text-center">
        {/* 404 Header */}
        <div className="mb-8" style={{ animation: 'fadeInUp 0.5s ease both' }}>
          <h1 className="text-6xl font-bold mb-2" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            404
          </h1>
          <p className="text-2xl font-semibold" style={{ color: 'var(--color-text-muted)' }}>
            Page Not Found
          </p>
        </div>

        {/* Description */}
        <p
          className="text-lg mb-8"
          style={{ color: 'var(--color-text-muted)', animation: 'fadeInUp 0.5s ease 0.1s both' }}
        >
          Sorry, the page you&apos;re looking for doesn&apos;t exist. It might have been moved or deleted.
        </p>

        {/* Error Icon */}
        <div className="mb-8" style={{ animation: 'gentleBounce 2s ease-in-out infinite' }}>
          <svg
            className="w-24 h-24 mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3" style={{ animation: 'fadeInUp 0.5s ease 0.2s both' }}>
          <Link
            href="/"
            className="inline-block w-full font-semibold py-3 px-6 rounded-xl"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-accent-contrast)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              boxShadow: '0 4px 14px rgba(47, 109, 246, 0.2)',
            }}
          >
            Go to Home
          </Link>
          <Link
            href="/login"
            className="inline-block w-full font-semibold py-3 px-6 rounded-xl"
            style={{
              background: 'var(--color-surface-muted)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              transition: 'transform 0.2s ease, border-color 0.2s ease',
            }}
          >
            Go to Login
          </Link>
        </div>

        {/* Footer */}
        <p className="mt-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          If you think this is a mistake, please{' '}
          <a
            href="mailto:support@nxtwave.co.in"
            className="font-medium"
            style={{ color: 'var(--color-accent)', transition: 'opacity 0.2s ease' }}
          >
            contact support
          </a>
        </p>
      </div>
    </div>
  )
}
