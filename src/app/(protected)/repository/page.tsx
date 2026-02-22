import { getAuthenticatedEmployeeView } from '@/core/presenters/auth-presenter'
import RepositoryWorkspace from '@/modules/contracts/ui/RepositoryWorkspace'

export default async function RepositoryPage() {
  const session = await getAuthenticatedEmployeeView()

  return <RepositoryWorkspace session={{ fullName: session.fullName, role: session.role }} />
}
