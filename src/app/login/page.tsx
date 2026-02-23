'use client'

import { Suspense } from 'react'
import LoginPageContent from '@/app/login/login-content'

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  )
}

function LoginPageFallback() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background:
          'linear-gradient(135deg, var(--color-background) 0%, var(--color-surface-muted) 50%, var(--color-accent-soft) 100%)',
      }}
    >
      <div className="w-full max-w-md" style={{ animation: 'fadeIn 0.4s ease' }}>
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--color-shadow-lg)',
          }}
        >
          <div className="text-center">
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: 'var(--color-accent)',
                color: 'var(--color-accent-contrast)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 800,
                marginBottom: 12,
                boxShadow: '0 4px 16px rgba(47, 109, 246, 0.25)',
              }}
            >
              NX
            </div>
            <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
              NXT Legal
            </h1>
            <p style={{ color: 'var(--color-text-muted)' }}>Employee Portal Login</p>
            <div className="mt-8 flex justify-center">
              <div
                className="rounded-full h-8 w-8"
                style={{
                  border: '2px solid transparent',
                  borderTopColor: 'var(--color-accent)',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
