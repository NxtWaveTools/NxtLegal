import { Suspense } from 'react'
import { getAuthenticatedEmployeeView } from '@/core/presenters/auth-presenter'
import ContractsWorkspace from '@/modules/contracts/ui/ContractsWorkspace'

function DashboardContractsFallback() {
  return (
    <div style={{ padding: '1rem 1.25rem' }}>
      <div style={{ height: 18, width: 220, borderRadius: 6, background: 'var(--border)' }} />
      <div style={{ height: 14, width: 280, borderRadius: 6, background: 'var(--border)', marginTop: 10 }} />
      <div style={{ height: 340, borderRadius: 12, background: 'var(--border)', marginTop: 18 }} />
    </div>
  )
}

export default async function ContractsPage() {
  const session = await getAuthenticatedEmployeeView()

  return (
    <Suspense fallback={<DashboardContractsFallback />}>
      <ContractsWorkspace session={{ employeeId: session.employeeId, role: session.role }} />
    </Suspense>
  )
}
