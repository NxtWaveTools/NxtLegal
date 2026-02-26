'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { authClient } from '@/core/client/auth-client'
import { authErrorMessages } from '@/core/constants/auth-errors'
import { limits } from '@/core/constants/limits'
import { routeRegistry } from '@/core/config/route-registry'

type EmployeeLoginState = {
  email: string
  password: string
  error: string
  loading: boolean
  setEmail: (value: string) => void
  setPassword: (value: string) => void
  submit: () => Promise<void>
}

export const useEmployeeLogin = (): EmployeeLoginState => {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')

    if (!email.trim()) {
      setError('Please enter your work email')
      return
    }

    if (!password) {
      setError('Please enter your password')
      return
    }

    if (password.length > limits.passwordMaxLength) {
      setError(`Password exceeds maximum length of ${limits.passwordMaxLength} characters`)
      return
    }

    setLoading(true)

    try {
      const response = await authClient.login(email.trim().toLowerCase(), password)

      if (!response || typeof response.ok !== 'boolean') {
        setError(authErrorMessages.auth_failed)
        toast.error(authErrorMessages.auth_failed)
        setLoading(false)
        return
      }

      if (!response.ok) {
        const message = response.error?.message ?? authErrorMessages.auth_failed
        setError(message)
        toast.error(message)
        setLoading(false)
        return
      }

      if (!response.data?.user?.email) {
        setError(authErrorMessages.auth_failed)
        toast.error(authErrorMessages.auth_failed)
        setLoading(false)
        return
      }

      toast.success('Login successful')
      router.push(routeRegistry.protected.dashboard)
      router.refresh()
    } catch {
      setError(authErrorMessages.auth_failed)
      toast.error(authErrorMessages.auth_failed)
      setLoading(false)
    }
  }

  return {
    email,
    password,
    error,
    loading,
    setEmail,
    setPassword,
    submit,
  }
}
