import { Suspense } from 'react'
import { getAuthenticatedEmployeeViewWithApproverHistoryAccess } from '@/core/presenters/auth-presenter'
import DashboardClient from '@/modules/dashboard/ui/DashboardClient'

function DashboardPageFallback() {
  return (
    <div style={{ padding: '1rem 1.25rem' }}>
      <div style={{ height: 18, width: 220, borderRadius: 6, background: 'var(--border)' }} />
      <div style={{ height: 14, width: 300, borderRadius: 6, background: 'var(--border)', marginTop: 10 }} />
      <div style={{ height: 220, borderRadius: 12, background: 'var(--border)', marginTop: 18 }} />
    </div>
  )
}

export default async function DashboardPage() {
  const session = await getAuthenticatedEmployeeViewWithApproverHistoryAccess()

  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <DashboardClient session={session} />
    </Suspense>
  )
}
