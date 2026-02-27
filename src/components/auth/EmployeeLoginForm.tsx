'use client'

import type { FormEvent } from 'react'
import { limits } from '@/core/constants/limits'
import Spinner from '@/components/ui/Spinner'
import { useEmployeeLogin } from '@/modules/auth/ui/use-employee-login'

export default function EmployeeLoginForm() {
  const { email, password, loading, setEmail, setPassword, submit } = useEmployeeLogin()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submit()
  }

  return (
    <form className="flex flex-col gap-3 w-full" onSubmit={handleSubmit}>
      <input
        type="email"
        placeholder="Work Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border border-gray-300 bg-white text-gray-900 p-3 rounded focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-500"
        disabled={loading}
        autoComplete="username"
      />
      <input
        type="password"
        placeholder={`Password (max ${limits.passwordMaxLength} characters)`}
        value={password}
        onChange={(e) => setPassword(e.target.value.slice(0, limits.passwordMaxLength))}
        className="border border-gray-300 bg-white text-gray-900 p-3 rounded focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-500"
        disabled={loading}
        maxLength={limits.passwordMaxLength}
        autoComplete="current-password"
      />
      <button
        type="submit"
        className="bg-black text-white p-3 rounded font-medium hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        disabled={loading}
      >
        {loading ? <Spinner size={14} /> : null}
        {loading ? 'Signing in...' : 'Login with Email'}
      </button>
    </form>
  )
}
