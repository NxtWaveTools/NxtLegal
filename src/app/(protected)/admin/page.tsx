import { redirect } from 'next/navigation'
import { getAuthenticatedEmployeeViewWithApproverHistoryAccess } from '@/core/presenters/auth-presenter'
import { routeRegistry } from '@/core/config/route-registry'

const adminAllowedRoles = new Set(['ADMIN', 'LEGAL_ADMIN', 'SUPER_ADMIN'])

export default async function AdminConsolePage() {
  const session = await getAuthenticatedEmployeeViewWithApproverHistoryAccess()

  if (!adminAllowedRoles.has((session.role ?? '').toUpperCase())) {
    redirect(routeRegistry.protected.dashboard)
  }

  redirect(routeRegistry.protected.adminConsole)
}
