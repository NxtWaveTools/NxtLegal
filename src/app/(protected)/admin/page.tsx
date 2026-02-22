import { redirect } from 'next/navigation'
import AdminConsoleClient from '@/modules/admin/ui/AdminConsoleClient'
import { getAuthenticatedEmployeeView } from '@/core/presenters/auth-presenter'
import { routeRegistry } from '@/core/config/route-registry'

const adminAllowedRoles = new Set(['ADMIN', 'LEGAL_ADMIN', 'SUPER_ADMIN'])

export default async function AdminConsolePage() {
  const session = await getAuthenticatedEmployeeView()

  if (!adminAllowedRoles.has((session.role ?? '').toUpperCase())) {
    redirect(routeRegistry.protected.dashboard)
  }

  return <AdminConsoleClient session={{ fullName: session.fullName, role: session.role }} />
}
