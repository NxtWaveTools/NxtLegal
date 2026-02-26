/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import DashboardClient from '@/modules/dashboard/ui/DashboardClient'
import { contractsClient } from '@/core/client/contracts-client'
import { contractWorkflowRoles } from '@/core/constants/contracts'

const mockPush = jest.fn()
const mockReplace = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))

jest.mock('@/modules/dashboard/ui/ProtectedAppShell', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/modules/contracts/ui/third-party-upload/ThirdPartyUploadSidebar', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/components/ui/Spinner', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/modules/contracts/ui/ContractStatusBadge', () => ({
  __esModule: true,
  default: () => null,
}))

describe('DashboardClient legal upload action cards', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    jest.spyOn(contractsClient, 'dashboardContracts').mockResolvedValue({
      ok: true,
      data: {
        contracts: [],
        pagination: {
          cursor: null,
          limit: 1,
          total: 0,
        },
        filter: 'UNDER_REVIEW',
        additionalApproverSections: {
          actionableContracts: [],
        },
      },
    } as never)
  })

  it('shows Send for Signing card for LEGAL_TEAM users', () => {
    render(
      <DashboardClient
        session={{
          employeeId: 'employee-1',
          fullName: 'Legal User',
          email: 'legal@nxtwave.co.in',
          role: contractWorkflowRoles.legalTeam,
        }}
      />
    )

    expect(screen.getByRole('button', { name: /Upload Third-Party Contract/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Send for Signing/i })).toBeTruthy()
  })

  it('hides Send for Signing card for non-legal users', () => {
    render(
      <DashboardClient
        session={{
          employeeId: 'employee-2',
          fullName: 'Poc User',
          email: 'poc@nxtwave.co.in',
          role: contractWorkflowRoles.poc,
        }}
      />
    )

    expect(screen.getByRole('button', { name: /Upload Third-Party Contract/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Send for Signing/i })).toBeNull()
  })
})
