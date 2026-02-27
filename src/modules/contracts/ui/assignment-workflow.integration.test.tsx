/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContractsWorkspace from '@/modules/contracts/ui/ContractsWorkspace'
import RepositoryWorkspace from '@/modules/contracts/ui/RepositoryWorkspace'
import { contractsClient, type ContractDetailResponse, type ContractRecord } from '@/core/client/contracts-client'

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => ({
    get: () => null,
  }),
}))

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(),
    dismiss: jest.fn(),
  },
}))

jest.mock('@/modules/dashboard/ui/ProtectedAppShell', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/modules/contracts/ui/ContractStatusBadge', () => ({
  __esModule: true,
  default: ({ displayLabel, status }: { displayLabel?: string; status: string }) => (
    <span>{displayLabel ?? status}</span>
  ),
}))

jest.mock('@/modules/contracts/ui/ContractDocumentsPanel', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/modules/contracts/ui/ApprovalsTab', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/modules/contracts/ui/PrepareForSigningModal', () => ({
  __esModule: true,
  default: () => null,
}))

describe('Assignment workflow integration', () => {
  const baseContract: ContractRecord = {
    id: 'contract-1',
    title: 'Escrow Agreement - NA',
    contractTypeId: 'type-1',
    contractTypeName: 'Escrow Agreement',
    counterpartyName: 'NA',
    status: 'UNDER_REVIEW',
    displayStatusLabel: 'Under Review',
    repositoryStatus: 'UNDER_REVIEW',
    repositoryStatusLabel: 'Under Review',
    uploadedByEmployeeId: 'employee-poc',
    uploadedByEmail: 'poc@nxtwave.co.in',
    currentAssigneeEmployeeId: 'employee-trishanth',
    currentAssigneeEmail: 'trishanth.reddy@nxtwave.co.in',
    createdAt: '2026-02-27T03:30:00.000Z',
    updatedAt: '2026-02-27T03:30:00.000Z',
    requestCreatedAt: '2026-02-27T03:30:00.000Z',
    departmentId: 'dept-1',
    departmentName: 'Finance',
    assignedToUsers: ['legal1@nxtwave.co.in', 'trishanth.reddy@nxtwave.co.in'],
    fileName: 'escrow.docx',
    fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileSizeBytes: 1024,
  }

  const buildDetailResponse = (assignedEmails: string[]): ContractDetailResponse => ({
    contract: {
      ...baseContract,
      assignedToUsers: assignedEmails,
      signatoryName: 'Signer',
      signatoryDesignation: 'Manager',
      signatoryEmail: 'signer@nxtwave.co.in',
      backgroundOfRequest: 'Need review',
      budgetApproved: true,
      currentDocumentId: 'doc-1',
    },
    counterparties: [],
    documents: [],
    availableActions: [],
    additionalApprovers: [],
    legalCollaborators: assignedEmails.map((email, index) => ({
      id: `collab-${index + 1}`,
      collaboratorEmployeeId: `employee-${index + 1}`,
      collaboratorEmail: email,
      createdAt: '2026-02-27T03:30:00.000Z',
    })),
    signatories: [],
  })

  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('integration: removing collaborator in details updates Legal Work Sharing list', async () => {
    const state = {
      collaborators: ['legal1@nxtwave.co.in', 'trishanth.reddy@nxtwave.co.in'],
    }

    jest.spyOn(contractsClient, 'list').mockResolvedValue({
      ok: true,
      data: {
        contracts: [{ ...baseContract, assignedToUsers: [...state.collaborators] }],
        pagination: { cursor: null, limit: 15, total: 1 },
      },
    } as never)

    jest.spyOn(contractsClient, 'detail').mockImplementation(async () => ({
      ok: true,
      data: buildDetailResponse(state.collaborators),
    }))

    jest.spyOn(contractsClient, 'timeline').mockResolvedValue({ ok: true, data: { events: [] } } as never)

    jest.spyOn(contractsClient, 'manageAssignment').mockImplementation(async (_contractId, payload) => {
      if (payload.operation === 'remove_collaborator') {
        state.collaborators = state.collaborators.filter((email) => email !== payload.collaboratorEmail.toLowerCase())
      }

      return {
        ok: true,
        data: buildDetailResponse(state.collaborators),
      } as never
    })

    render(
      <ContractsWorkspace
        session={{
          employeeId: 'employee-legal',
          role: 'LEGAL_TEAM',
        }}
      />
    )

    await waitFor(() => expect(screen.getByText('Legal Work Sharing')).toBeTruthy())
    expect(screen.getByText('legal1@nxtwave.co.in')).toBeTruthy()
    expect(screen.getAllByText('trishanth.reddy@nxtwave.co.in').length).toBeGreaterThan(0)

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])

    await waitFor(() => {
      expect(screen.queryByText('legal1@nxtwave.co.in')).toBeNull()
      expect(screen.getAllByText('trishanth.reddy@nxtwave.co.in').length).toBeGreaterThan(0)
    })
  })

  it('end-to-end click-flow: assign 2, remove 1 in details, repository shows remaining assignee', async () => {
    const state = {
      collaborators: ['legal1@nxtwave.co.in', 'trishanth.reddy@nxtwave.co.in'],
    }

    jest.spyOn(contractsClient, 'list').mockResolvedValue({
      ok: true,
      data: {
        contracts: [{ ...baseContract, assignedToUsers: [...state.collaborators] }],
        pagination: { cursor: null, limit: 15, total: 1 },
      },
    } as never)

    jest.spyOn(contractsClient, 'detail').mockImplementation(async () => ({
      ok: true,
      data: buildDetailResponse(state.collaborators),
    }))

    jest.spyOn(contractsClient, 'timeline').mockResolvedValue({ ok: true, data: { events: [] } } as never)

    jest.spyOn(contractsClient, 'manageAssignment').mockImplementation(async (_contractId, payload) => {
      if (payload.operation === 'remove_collaborator') {
        state.collaborators = state.collaborators.filter((email) => email !== payload.collaboratorEmail.toLowerCase())
      }
      if (payload.operation === 'add_collaborator') {
        state.collaborators = Array.from(new Set([...state.collaborators, payload.collaboratorEmail.toLowerCase()]))
      }

      return {
        ok: true,
        data: buildDetailResponse(state.collaborators),
      } as never
    })

    jest.spyOn(contractsClient, 'repositoryList').mockImplementation(async () => ({
      ok: true,
      data: {
        contracts: [
          {
            ...baseContract,
            assignedToUsers: [...state.collaborators],
          },
        ],
        pagination: { cursor: null, limit: 15, total: 1 },
      },
    }))

    jest.spyOn(contractsClient, 'repositoryReport').mockResolvedValue({
      ok: true,
      data: {
        report: {
          departmentMetrics: [],
          statusMetrics: [],
        },
      },
    } as never)

    jest.spyOn(contractsClient, 'legalTeamMembers').mockResolvedValue({
      ok: true,
      data: {
        members: [
          { id: 'employee-legal1', email: 'legal1@nxtwave.co.in', fullName: 'Legal One' },
          {
            id: 'employee-trishanth',
            email: 'trishanth.reddy@nxtwave.co.in',
            fullName: 'Trishanth Reddy',
          },
        ],
      },
    } as never)

    const detailsRender = render(
      <ContractsWorkspace
        session={{
          employeeId: 'employee-legal',
          role: 'LEGAL_TEAM',
        }}
      />
    )

    await waitFor(() => expect(screen.getByText('Legal Work Sharing')).toBeTruthy())

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])

    await waitFor(() => expect(screen.queryByText('legal1@nxtwave.co.in')).toBeNull())

    detailsRender.unmount()

    render(
      <RepositoryWorkspace
        session={{
          fullName: 'Legal User',
          email: 'legalteam@nxtwave.co.in',
          role: 'LEGAL_TEAM',
          canAccessApproverHistory: true,
        }}
      />
    )

    await waitFor(() => {
      expect(contractsClient.repositoryList).toHaveBeenCalled()
      expect(screen.getByRole('button', { name: /Trishanth Reddy/i })).toBeTruthy()
    })

    expect(screen.queryByRole('button', { name: /Legal One/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Assign Contract/i })).toBeNull()
  })
})
