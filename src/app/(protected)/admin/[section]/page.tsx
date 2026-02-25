import { redirect } from 'next/navigation'
import AdminConsoleClient from '@/modules/admin/ui/AdminConsoleClient'
import { getAuthenticatedEmployeeViewWithApproverHistoryAccess } from '@/core/presenters/auth-presenter'
import { routeRegistry } from '@/core/config/route-registry'
import { adminSectionRegistry } from '@/core/config/admin-section-registry'

type AdminSectionPageProps = {
  params: Promise<{
    section: string
  }>
}

const adminAllowedRoles = new Set(['ADMIN', 'LEGAL_ADMIN', 'SUPER_ADMIN'])

export default async function AdminSectionPage({ params }: AdminSectionPageProps) {
  const session = await getAuthenticatedEmployeeViewWithApproverHistoryAccess()

  if (!adminAllowedRoles.has((session.role ?? '').toUpperCase())) {
    redirect(routeRegistry.protected.dashboard)
  }

  const { section } = await params
  if (!adminSectionRegistry.isValidSectionKey(section)) {
    redirect(routeRegistry.protected.adminConsole)
  }

  return (
    <AdminConsoleClient
      activeSection={section}
      session={{
        employeeId: session.employeeId,
        fullName: session.fullName,
        email: session.email,
        team: session.team,
        role: session.role,
        canAccessApproverHistory: session.canAccessApproverHistory,
      }}
    />
  )
}
