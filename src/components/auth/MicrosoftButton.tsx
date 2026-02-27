'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import Spinner from '@/components/ui/Spinner'
import { startMicrosoftOAuth } from '@/core/infra/auth/supabase-oauth-client'

export default function MicrosoftButton() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const login = async () => {
    if (isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      await startMicrosoftOAuth()
      toast.success('Redirecting to Microsoft sign-in')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <button
      onClick={login}
      className="w-full bg-blue-600 text-white px-4 py-3 rounded font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-65 disabled:cursor-not-allowed"
      disabled={isSubmitting}
    >
      {isSubmitting ? <Spinner size={14} /> : null}
      <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
      {isSubmitting ? 'Redirecting...' : 'Sign in with Microsoft'}
    </button>
  )
}
