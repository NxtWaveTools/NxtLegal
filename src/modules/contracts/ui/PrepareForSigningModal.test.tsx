/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import PrepareForSigningModal from '@/modules/contracts/ui/PrepareForSigningModal'
import { contractsClient } from '@/core/client/contracts-client'

jest.mock('react-pdf', () => {
  return {
    pdfjs: {
      version: '4.10.0',
      GlobalWorkerOptions: { workerSrc: '' },
    },
    Document: ({
      children,
      onLoadSuccess,
    }: {
      children: React.ReactNode
      onLoadSuccess?: (value: { numPages: number }) => void
    }) => {
      React.useEffect(() => {
        onLoadSuccess?.({ numPages: 1 })
      }, [onLoadSuccess])

      return <div data-testid="pdf-document">{children}</div>
    },
    Page: () => <div data-testid="pdf-page">PDF Page</div>,
  }
})

function createContractView() {
  return {
    contract: {
      id: 'contract-1',
      title: 'Master Service Agreement',
      status: 'IN_SIGNATURE',
      uploadedByEmployeeId: 'employee-1',
      uploadedByEmail: 'legal@nxtwave.co.in',
      currentAssigneeEmployeeId: 'employee-2',
      currentAssigneeEmail: 'owner@nxtwave.co.in',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    documents: [],
    availableActions: [],
    additionalApprovers: [],
    signatories: [],
  }
}

describe('PrepareForSigningModal', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('blocks send when recipient has no SIGNATURE field', async () => {
    jest.spyOn(contractsClient, 'getSigningPreparationDraft').mockResolvedValue({
      ok: true,
      data: {
        contractId: 'contract-1',
        recipients: [
          {
            name: 'Vendor',
            email: 'vendor@nxtwave.co.in',
            recipientType: 'EXTERNAL',
            routingOrder: 1,
          },
        ],
        fields: [],
        createdByEmployeeId: 'employee-1',
        updatedByEmployeeId: 'employee-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    } as never)

    const sendSpy = jest.spyOn(contractsClient, 'sendSigningPreparationDraft').mockResolvedValue({
      ok: true,
      data: { envelopeId: 'env-1', contractView: createContractView() },
    } as never)

    render(
      <PrepareForSigningModal
        isOpen
        contractId="contract-1"
        contractStatus="FINAL_APPROVED"
        pdfUrl="/api/contracts/contract-1/preview"
        onClose={jest.fn()}
        onSent={jest.fn()}
      />
    )

    await waitFor(() => expect(contractsClient.getSigningPreparationDraft).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Review & Send' }))

    expect(await screen.findByText(/At least one SIGNATURE field is required/i)).toBeTruthy()
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('saves loaded draft via save endpoint', async () => {
    jest.spyOn(contractsClient, 'getSigningPreparationDraft').mockResolvedValue({
      ok: true,
      data: {
        contractId: 'contract-1',
        recipients: [
          {
            name: 'Vendor',
            email: 'Vendor@NxtWave.co.in',
            recipientType: 'EXTERNAL',
            routingOrder: 1,
          },
        ],
        fields: [
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 22.5,
            yPosition: 37.25,
            anchorString: null,
            assignedSignerEmail: 'Vendor@NxtWave.co.in',
          },
        ],
        createdByEmployeeId: 'employee-1',
        updatedByEmployeeId: 'employee-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    } as never)

    const saveSpy = jest.spyOn(contractsClient, 'saveSigningPreparationDraft').mockResolvedValue({
      ok: true,
      data: null,
    } as never)

    render(
      <PrepareForSigningModal
        isOpen
        contractId="contract-1"
        contractStatus="FINAL_APPROVED"
        pdfUrl="/api/contracts/contract-1/preview"
        onClose={jest.fn()}
        onSent={jest.fn()}
      />
    )

    await waitFor(() => expect(contractsClient.getSigningPreparationDraft).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith('contract-1', {
        recipients: [
          {
            name: 'Vendor',
            email: 'vendor@nxtwave.co.in',
            recipient_type: 'EXTERNAL',
            routing_order: 1,
          },
        ],
        fields: [
          {
            field_type: 'SIGNATURE',
            page_number: 1,
            x_position: 22.5,
            y_position: 37.25,
            anchor_string: undefined,
            assigned_signer_email: 'vendor@nxtwave.co.in',
          },
        ],
      })
    })
  })

  it('sends draft and notifies parent callbacks', async () => {
    jest.spyOn(contractsClient, 'getSigningPreparationDraft').mockResolvedValue({
      ok: true,
      data: {
        contractId: 'contract-1',
        recipients: [
          {
            name: 'Vendor',
            email: 'vendor@nxtwave.co.in',
            recipientType: 'EXTERNAL',
            routingOrder: 1,
          },
        ],
        fields: [
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 15,
            yPosition: 20,
            anchorString: null,
            assignedSignerEmail: 'vendor@nxtwave.co.in',
          },
        ],
        createdByEmployeeId: 'employee-1',
        updatedByEmployeeId: 'employee-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    } as never)

    const onClose = jest.fn()
    const onSent = jest.fn()
    const contractView = createContractView()

    const saveSpy = jest.spyOn(contractsClient, 'saveSigningPreparationDraft').mockResolvedValue({
      ok: true,
      data: null,
    } as never)

    const sendSpy = jest.spyOn(contractsClient, 'sendSigningPreparationDraft').mockResolvedValue({
      ok: true,
      data: { envelopeId: 'env-123', contractView },
    } as never)

    render(
      <PrepareForSigningModal
        isOpen
        contractId="contract-1"
        contractStatus="FINAL_APPROVED"
        pdfUrl="/api/contracts/contract-1/preview"
        onClose={onClose}
        onSent={onSent}
      />
    )

    await waitFor(() => expect(contractsClient.getSigningPreparationDraft).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Review & Send' }))

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        'contract-1',
        expect.objectContaining({
          recipients: expect.any(Array),
          fields: expect.any(Array),
        })
      )
      expect(sendSpy).toHaveBeenCalledWith('contract-1')
      expect(onSent).toHaveBeenCalledWith(contractView)
      expect(onClose).toHaveBeenCalled()
    })
  })
})
