'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Spinner from '@/components/ui/Spinner'
import { authClient } from '@/core/client/auth-client'
import { routeRegistry } from '@/core/config/route-registry'
import styles from './LogoutButton.module.css'

export default function LogoutButton() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleLogout = async () => {
    if (isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await authClient.logout()

      if (response.ok) {
        toast.success('Logged out successfully')
        router.push(routeRegistry.public.login)
        router.refresh()
        return
      }

      toast.error(response.error?.message ?? 'Failed to log out')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <button onClick={handleLogout} className={styles.button} disabled={isSubmitting}>
      <span className={styles.content}>
        {isSubmitting ? <Spinner size={14} /> : null}
        {isSubmitting ? 'Logging out…' : 'Logout'}
      </span>
    </button>
  )
}
