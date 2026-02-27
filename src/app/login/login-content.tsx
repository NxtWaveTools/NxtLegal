'use client'

import EmployeeLoginForm from '@/components/auth/EmployeeLoginForm'
import MicrosoftButton from '@/components/auth/MicrosoftButton'
import { publicConfig } from '@/core/config/public-config'
import { useLoginPage } from '@/modules/auth/ui/use-login-page'

export default function LoginPageContent() {
  useLoginPage()
  const allowedDomainsText = publicConfig.auth.allowedDomains.join(', ')

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          'linear-gradient(135deg, var(--color-background) 0%, var(--color-surface-muted) 50%, var(--color-accent-soft) 100%)',
      }}
    >
      <div
        className="w-full max-w-md"
        style={{
          animation: 'fadeInUp 0.6s ease both',
        }}
      >
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--color-shadow-lg)',
          }}
        >
          {/* Header */}
          <div className="text-center mb-8">
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
            <p className="text-sm font-medium mt-2" style={{ color: 'var(--color-accent)' }}>
              Please use your Microsoft account to sign in
            </p>
          </div>

          {publicConfig.features.enableMicrosoftOAuth && (
            <div className="mb-6">
              <MicrosoftButton />
            </div>
          )}

          {publicConfig.features.enableMicrosoftOAuth && publicConfig.features.enablePasswordLogin && (
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full" style={{ borderTop: '1px solid var(--color-border)' }} />
              </div>
              <div className="relative flex justify-center text-sm">
                <span
                  className="px-3 font-medium"
                  style={{
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  If Microsoft not available, use backup login
                </span>
              </div>
            </div>
          )}

          {publicConfig.features.enablePasswordLogin && <EmployeeLoginForm />}

          {/* Footer */}
          <div className="mt-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            <p className="flex items-center justify-center gap-1">
              <svg
                className="w-4 h-4"
                fill="currentColor"
                viewBox="0 0 20 20"
                style={{ color: 'var(--color-success)' }}
              >
                <path
                  fillRule="evenodd"
                  d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Restricted to {allowedDomainsText} employees only</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
