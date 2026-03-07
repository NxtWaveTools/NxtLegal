import { Suspense } from 'react'
import { getAuthenticatedEmployeeViewWithApproverHistoryAccess } from '@/core/presenters/auth-presenter'
import RepositoryWorkspace from '@/modules/contracts/ui/RepositoryWorkspace'

function RepositoryPageFallback() {
  return (
    <div style={{ padding: '1rem 1.25rem' }}>
      <div style={{ height: 18, width: 180, borderRadius: 6, background: 'var(--border)' }} />
      <div style={{ height: 14, width: 260, borderRadius: 6, background: 'var(--border)', marginTop: 10 }} />
      <div style={{ height: 320, borderRadius: 12, background: 'var(--border)', marginTop: 18 }} />
    </div>
  )
}

export default async function RepositoryPage() {
  const session = await getAuthenticatedEmployeeViewWithApproverHistoryAccess()

  return (
    <Suspense fallback={<RepositoryPageFallback />}>
      <RepositoryWorkspace
        session={{
          fullName: session.fullName,
          email: session.email,
          team: session.team,
          role: session.role,
          canAccessApproverHistory: session.canAccessApproverHistory,
        }}
      />
    </Suspense>
  )
}
