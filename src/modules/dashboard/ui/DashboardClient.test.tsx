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

describe('DashboardClient contract aging and TAT breach indicators', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows numeric aging and overdue breach label for breached active contracts', async () => {
    jest.spyOn(contractsClient, 'dashboardContracts').mockImplementation(async (params) => {
      if (params.includeExtras) {
        return {
          ok: true,
          data: {
            contracts: [
              {
                id: 'contract-1',
                title: 'Vendor Master Services Agreement',
                status: 'UNDER_REVIEW',
                uploadedByEmployeeId: 'emp-1',
                uploadedByEmail: 'owner@nxtwave.co.in',
                currentAssigneeEmployeeId: 'emp-legal-1',
                currentAssigneeEmail: 'legal@nxtwave.co.in',
                agingBusinessDays: 9,
                isTatBreached: true,
                createdAt: '2026-02-20T10:00:00.000Z',
                updatedAt: '2026-02-27T10:00:00.000Z',
              },
            ],
            pagination: {
              cursor: null,
              limit: 1,
              total: 1,
            },
            filter: 'UNDER_REVIEW',
            additionalApproverSections: {
              actionableContracts: [],
            },
          },
        } as never
      }

      return {
        ok: true,
        data: {
          contracts: [],
          pagination: {
            cursor: null,
            limit: 1,
            total: 0,
          },
          filter: params.filter,
          additionalApproverSections: {
            actionableContracts: [],
          },
        },
      } as never
    })

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

    expect(await screen.findByText('Contract aging: 9 business days')).toBeTruthy()
    expect(await screen.findByText('TAT Breached · Overdue by 2 days')).toBeTruthy()
  })

  it('hides aging and TAT breached message after completion even when breach flags are present', async () => {
    jest.spyOn(contractsClient, 'dashboardContracts').mockImplementation(async (params) => {
      if (params.includeExtras) {
        return {
          ok: true,
          data: {
            contracts: [
              {
                id: 'contract-2',
                title: 'Completed Agreement',
                status: 'COMPLETED',
                uploadedByEmployeeId: 'emp-2',
                uploadedByEmail: 'owner@nxtwave.co.in',
                currentAssigneeEmployeeId: 'emp-legal-2',
                currentAssigneeEmail: 'legal-2@nxtwave.co.in',
                agingBusinessDays: 10,
                isTatBreached: true,
                createdAt: '2026-02-18T10:00:00.000Z',
                updatedAt: '2026-02-27T10:00:00.000Z',
              },
            ],
            pagination: {
              cursor: null,
              limit: 1,
              total: 1,
            },
            filter: 'COMPLETED',
            additionalApproverSections: {
              actionableContracts: [],
            },
          },
        } as never
      }

      return {
        ok: true,
        data: {
          contracts: [],
          pagination: {
            cursor: null,
            limit: 1,
            total: 0,
          },
          filter: params.filter,
          additionalApproverSections: {
            actionableContracts: [],
          },
        },
      } as never
    })

    render(
      <DashboardClient
        session={{
          employeeId: 'employee-2',
          fullName: 'Legal User',
          email: 'legal@nxtwave.co.in',
          role: contractWorkflowRoles.legalTeam,
        }}
      />
    )

    expect(await screen.findByText('Completed Agreement')).toBeTruthy()
    expect(screen.queryByText('Contract aging: 10 business days')).toBeNull()
    expect(screen.queryByText(/TAT Breached/)).toBeNull()
  })
})

describe('DashboardClient HOD experience updates', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('hides Upload Third-Party Contract action card for HOD users', async () => {
    jest.spyOn(contractsClient, 'dashboardContracts').mockResolvedValue({
      ok: true,
      data: {
        contracts: [],
        pagination: {
          cursor: null,
          limit: 1,
          total: 0,
        },
        filter: 'HOD_PENDING',
        additionalApproverSections: {
          actionableContracts: [],
        },
      },
    } as never)

    render(
      <DashboardClient
        session={{
          employeeId: 'employee-hod-1',
          fullName: 'HOD User',
          email: 'hod@nxtwave.co.in',
          role: contractWorkflowRoles.hod,
        }}
      />
    )

    expect(await screen.findByText('My Contracts')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Upload Third-Party Contract/i })).toBeNull()
  })

  it('shows approval requested elapsed label for HOD pending contracts', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-02-27T12:00:00.000Z').getTime())

    jest.spyOn(contractsClient, 'dashboardContracts').mockImplementation(async (params) => {
      if (params.includeExtras) {
        return {
          ok: true,
          data: {
            contracts: [
              {
                id: 'contract-hod-1',
                title: 'MSA - Acme Corp',
                status: 'HOD_PENDING',
                uploadedByEmployeeId: 'emp-1',
                uploadedByEmail: 'owner@nxtwave.co.in',
                currentAssigneeEmployeeId: 'emp-hod-1',
                currentAssigneeEmail: 'hod@nxtwave.co.in',
                requestCreatedAt: '2026-02-27T09:00:00.000Z',
                createdAt: '2026-02-27T08:00:00.000Z',
                updatedAt: '2026-02-27T09:00:00.000Z',
              },
            ],
            pagination: {
              cursor: null,
              limit: 1,
              total: 1,
            },
            filter: 'HOD_PENDING',
            additionalApproverSections: {
              actionableContracts: [],
            },
          },
        } as never
      }

      return {
        ok: true,
        data: {
          contracts: [],
          pagination: {
            cursor: null,
            limit: 1,
            total: 0,
          },
          filter: params.filter,
          additionalApproverSections: {
            actionableContracts: [],
          },
        },
      } as never
    })

    render(
      <DashboardClient
        session={{
          employeeId: 'employee-hod-1',
          fullName: 'HOD User',
          email: 'hod@nxtwave.co.in',
          role: contractWorkflowRoles.hod,
        }}
      />
    )

    expect(await screen.findByText('Approval requested 3 hours ago')).toBeTruthy()
    expect(screen.queryByText(/^Contract aging:/i)).toBeNull()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })
})

describe('DashboardClient admin personal approvals queue', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses personal scope for Assigned To Me and keeps All HOD Pending as a distinct tab', async () => {
    const dashboardContractsSpy = jest
      .spyOn(contractsClient, 'dashboardContracts')
      .mockImplementation(async (params) => {
        return {
          ok: true,
          data: {
            contracts: [],
            pagination: {
              cursor: null,
              limit: params.limit ?? 1,
              total: 0,
            },
            filter: params.filter,
            additionalApproverSections: {
              actionableContracts: [],
            },
          },
        } as never
      })

    render(
      <DashboardClient
        session={{
          employeeId: 'admin-1',
          fullName: 'Admin User',
          email: 'admin@nxtwave.co.in',
          role: contractWorkflowRoles.admin,
        }}
      />
    )

    expect(await screen.findByRole('button', { name: /Assigned To Me \(0\)/i })).toBeTruthy()
    expect(await screen.findByRole('button', { name: /All HOD Pending \(0\)/i })).toBeTruthy()

    expect(
      dashboardContractsSpy.mock.calls.some(
        ([params]) => params.filter === 'ASSIGNED_TO_ME' && params.scope === 'personal'
      )
    ).toBe(true)
  })
})
