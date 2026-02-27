/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContractsWorkspace from '@/modules/contracts/ui/ContractsWorkspace'
import { contractsClient, type ContractDetailResponse, type ContractRecord } from '@/core/client/contracts-client'
import { triggerContractStatusConfetti } from '@/modules/contracts/ui/contract-status-confetti'

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

jest.mock('@/modules/contracts/ui/contract-status-confetti', () => ({
  triggerContractStatusConfetti: jest.fn(),
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

type DeferredPromise<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

const createDeferred = <T,>(): DeferredPromise<T> => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

describe('Contract action dialogs', () => {
  const baseContract: ContractRecord = {
    id: 'contract-1',
    title: 'Board Meeting Documents - NA',
    contractTypeId: 'type-1',
    contractTypeName: 'Board Meeting Documents',
    counterpartyName: 'NA',
    status: 'UNDER_REVIEW',
    displayStatusLabel: 'Under Review',
    repositoryStatus: 'UNDER_REVIEW',
    repositoryStatusLabel: 'Under Review',
    uploadedByEmployeeId: 'employee-poc',
    uploadedByEmail: 'poc@nxtwave.co.in',
    currentAssigneeEmployeeId: 'employee-legal',
    currentAssigneeEmail: 'legalteam@nxtwave.co.in',
    createdAt: '2026-02-27T03:30:00.000Z',
    updatedAt: '2026-02-27T03:30:00.000Z',
    requestCreatedAt: '2026-02-27T03:30:00.000Z',
    departmentId: 'dept-1',
    departmentName: 'Finance',
    fileName: 'demo.docx',
    fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileSizeBytes: 1024,
  }

  const buildDetail = (status: string, displayStatusLabel: string): ContractDetailResponse => ({
    contract: {
      ...baseContract,
      status,
      displayStatusLabel,
      currentDocumentId: 'doc-1',
    },
    counterparties: [],
    documents: [],
    availableActions: [
      {
        action: 'legal.set.pending_external',
        label: 'Set Pending External',
        requiresRemark: false,
      },
    ],
    additionalApprovers: [],
    legalCollaborators: [],
    signatories: [],
  })

  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('keeps confirm dialog in processing state until post-action refresh completes without confetti for non-terminal statuses', async () => {
    const deferredReloadList = createDeferred<Awaited<ReturnType<typeof contractsClient.list>>>()
    let shouldDeferPostActionReload = false

    jest.spyOn(contractsClient, 'list').mockImplementation(async () => {
      if (!shouldDeferPostActionReload) {
        return {
          ok: true,
          data: {
            contracts: [baseContract],
            pagination: { cursor: null, limit: 15, total: 1 },
          },
        } as never
      }

      return deferredReloadList.promise as never
    })

    jest.spyOn(contractsClient, 'detail').mockImplementation(async () => {
      return {
        ok: true,
        data: buildDetail('UNDER_REVIEW', 'Under Review'),
      } as never
    })

    jest.spyOn(contractsClient, 'timeline').mockResolvedValue({ ok: true, data: { events: [] } } as never)

    jest.spyOn(contractsClient, 'action').mockImplementation(async () => {
      shouldDeferPostActionReload = true

      return {
        ok: true,
        data: buildDetail('PENDING_WITH_EXTERNAL_STAKEHOLDERS', 'Pending with External Stakeholders'),
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

    await waitFor(() => expect(screen.getByText('Board Meeting Documents - NA')).toBeTruthy())
    await waitFor(() => expect(screen.getByLabelText('Legal status actions')).toBeTruthy())

    const statusActionsSelect = screen.getByLabelText('Legal status actions')
    await userEvent.selectOptions(statusActionsSelect, 'legal.set.pending_external')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy())
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.getByText('Processing…')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
    })

    deferredReloadList.resolve({
      ok: true,
      data: {
        contracts: [{ ...baseContract, status: 'PENDING_WITH_EXTERNAL_STAKEHOLDERS' }],
        pagination: { cursor: null, limit: 15, total: 1 },
      },
    } as never)

    expect(triggerContractStatusConfetti).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(screen.queryByText('Processing…')).toBeNull()
    })
  })
})
