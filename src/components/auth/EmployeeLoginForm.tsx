'use client'

import { limits } from '@/core/constants/limits'
import Spinner from '@/components/ui/Spinner'
import { useEmployeeLogin } from '@/modules/auth/ui/use-employee-login'

export default function EmployeeLoginForm() {
  const { email, password, error, loading, setEmail, setPassword, submit } = useEmployeeLogin()

  return (
    <div className="flex flex-col gap-3 w-full">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}
      <input
        type="email"
        placeholder="Work Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="border border-gray-300 bg-white text-gray-900 p-3 rounded focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-500"
        disabled={loading}
        autoComplete="username"
      />
      <input
        type="password"
        placeholder={`Password (max ${limits.passwordMaxLength} characters)`}
        value={password}
        onChange={(e) => setPassword(e.target.value.slice(0, limits.passwordMaxLength))}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="border border-gray-300 bg-white text-gray-900 p-3 rounded focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-500"
        disabled={loading}
        maxLength={limits.passwordMaxLength}
        autoComplete="current-password"
      />
      <button
        onClick={submit}
        className="bg-black text-white p-3 rounded font-medium hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        disabled={loading}
      >
        {loading ? <Spinner size={14} /> : null}
        {loading ? 'Signing in...' : 'Login with Email'}
      </button>
    </div>
  )
}
