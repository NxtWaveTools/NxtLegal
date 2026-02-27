'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { authClient } from '@/core/client/auth-client'
import { authErrorCodes, authErrorMessages } from '@/core/constants/auth-errors'
import { routeRegistry } from '@/core/config/route-registry'

export const useLoginPage = (): void => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lastErrorMessageRef = useRef('')

  const errorMap = useMemo(() => authErrorMessages, [])

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await authClient.getSession()
        if (response.ok && response.data?.authenticated) {
          router.push(routeRegistry.protected.dashboard)
        }
      } catch {
        // Stay on login page when session check fails.
      }
    }

    checkSession()
  }, [router])

  // Handle error messages from URL params in separate effect
  useEffect(() => {
    const errorParam = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    let errorMessage = ''
    if (errorParam === authErrorCodes.oauthFailed) {
      errorMessage = errorDescription
        ? `Microsoft sign-in failed: ${decodeURIComponent(errorDescription)}`
        : errorMap[authErrorCodes.oauthFailed]
    } else if (errorParam === authErrorCodes.noCode) {
      errorMessage = errorMap[authErrorCodes.noCode]
    } else if (errorParam === authErrorCodes.unauthorized) {
      errorMessage = errorMap[authErrorCodes.unauthorized]
    }

    // Check for errors in hash if not found in query params
    if (!errorMessage && typeof window !== 'undefined' && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''))
      const hashError = hashParams.get('error')
      const hashDescription = hashParams.get('error_description')
      if (hashError) {
        errorMessage = hashDescription
          ? `Microsoft sign-in failed: ${decodeURIComponent(hashDescription)}`
          : errorMap[authErrorCodes.oauthFailed]
      }
    }

    if (errorMessage && errorMessage !== lastErrorMessageRef.current) {
      toast.error(errorMessage)
      lastErrorMessageRef.current = errorMessage
      return
    }

    if (!errorMessage && lastErrorMessageRef.current) {
      lastErrorMessageRef.current = ''
    }
  }, [searchParams, errorMap])
}
