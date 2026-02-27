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

  const submit = async () => {
    if (!email.trim()) {
      toast.error('Please enter your work email')
      return
    }

    if (!password) {
      toast.error('Please enter your password')
      return
    }

    if (password.length > limits.passwordMaxLength) {
      toast.error(`Password exceeds maximum length of ${limits.passwordMaxLength} characters`)
      return
    }

    setLoading(true)

    try {
      const response = await authClient.login(email.trim().toLowerCase(), password)

      if (!response || typeof response.ok !== 'boolean') {
        toast.error(authErrorMessages.auth_failed)
        return
      }

      if (!response.ok) {
        const message = response.error?.message ?? authErrorMessages.auth_failed
        toast.error(message)
        return
      }

      if (!response.data?.user?.email) {
        toast.error(authErrorMessages.auth_failed)
        return
      }

      toast.success('Login successful')
      router.push(routeRegistry.protected.dashboard)
      router.refresh()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : authErrorMessages.auth_failed
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return {
    email,
    password,
    loading,
    setEmail,
    setPassword,
    submit,
  }
}
