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
        onLoadSuccess?.({ numPages: 3 })
      }, [])

      return <div data-testid="pdf-document">{children}</div>
    },
    Page: ({
      onLoadSuccess,
    }: {
      onLoadSuccess?: (value: {
        getViewport: ({ scale }: { scale: number }) => { width: number; height: number }
      }) => void
    }) => {
      React.useEffect(() => {
        onLoadSuccess?.({
          getViewport: ({ scale }) => ({
            width: 612 * scale,
            height: 792 * scale,
          }),
        })
      }, [])

      return <div data-testid="pdf-page">PDF Page</div>
    },
  }
})

function createContractView() {
  return {
    contract: {
      id: 'contract-1',
      title: 'Master Service Agreement',
      status: 'SIGNING',
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

  it('adds SIGNATURE field on all pages at same position when enabled', async () => {
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

    const saveSpy = jest.spyOn(contractsClient, 'saveSigningPreparationDraft').mockResolvedValue({
      ok: true,
      data: null,
    } as never)

    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    const getBoundingClientRectSpy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      x: 0,
      y: 0,
      width: 720,
      height: 1000,
      top: 0,
      left: 0,
      right: 720,
      bottom: 1000,
      toJSON: () => ({}),
    }))

    render(
      <PrepareForSigningModal
        isOpen
        contractId="contract-1"
        contractStatus="UNDER_REVIEW"
        pdfUrl="/api/contracts/contract-1/preview"
        onClose={jest.fn()}
        onSent={jest.fn()}
      />
    )

    await waitFor(() => expect(contractsClient.getSigningPreparationDraft).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '2. Assign Fields' }))
    await waitFor(() => expect(screen.queryByText('Loading draft…')).toBeNull())
    await waitFor(() => expect(screen.getByTestId('pdf-document')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Add signature on all pages'))
    await waitFor(() => expect(screen.getByTestId('pdf-document')).toBeTruthy())
    fireEvent.click(screen.getByTestId('pdf-document'), { clientX: 360, clientY: 500 })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        'contract-1',
        expect.objectContaining({
          fields: [
            {
              field_type: 'SIGNATURE',
              page_number: 1,
              x_position: 306,
              y_position: 396,
              width: 96,
              height: 22,
              anchor_string: undefined,
              assigned_signer_email: 'vendor@nxtwave.co.in',
            },
            {
              field_type: 'SIGNATURE',
              page_number: 2,
              x_position: 306,
              y_position: 396,
              width: 96,
              height: 22,
              anchor_string: undefined,
              assigned_signer_email: 'vendor@nxtwave.co.in',
            },
            {
              field_type: 'SIGNATURE',
              page_number: 3,
              x_position: 306,
              y_position: 396,
              width: 96,
              height: 22,
              anchor_string: undefined,
              assigned_signer_email: 'vendor@nxtwave.co.in',
            },
          ],
        })
      )
    })

    getBoundingClientRectSpy.mockRestore()
    rafSpy.mockRestore()
  })

  it('pre-populates recipients from initialRecipients when no draft exists', async () => {
    jest.spyOn(contractsClient, 'getSigningPreparationDraft').mockResolvedValue({
      ok: true,
      data: null,
    } as never)

    render(
      <PrepareForSigningModal
        isOpen
        contractId="contract-1"
        contractStatus="UNDER_REVIEW"
        pdfUrl="/api/contracts/contract-1/preview"
        initialRecipients={[
          {
            name: 'Vendor Signatory',
            email: 'Vendor@Example.com',
            recipientType: 'EXTERNAL',
            routingOrder: 1,
          },
        ]}
        onClose={jest.fn()}
        onSent={jest.fn()}
      />
    )

    await waitFor(() => expect(contractsClient.getSigningPreparationDraft).toHaveBeenCalled())

    expect((screen.getByPlaceholderText('Name') as HTMLInputElement).value).toBe('Vendor Signatory')
    expect((screen.getByPlaceholderText('Email') as HTMLInputElement).value).toBe('vendor@example.com')
  })

  it('adds SIGNATURE field only on current page by default', async () => {
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

    const saveSpy = jest.spyOn(contractsClient, 'saveSigningPreparationDraft').mockResolvedValue({
      ok: true,
      data: null,
    } as never)

    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    const getBoundingClientRectSpy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      x: 0,
      y: 0,
      width: 720,
      height: 1000,
      top: 0,
      left: 0,
      right: 720,
      bottom: 1000,
      toJSON: () => ({}),
    }))

    render(
      <PrepareForSigningModal
        isOpen
        contractId="contract-1"
        contractStatus="UNDER_REVIEW"
        pdfUrl="/api/contracts/contract-1/preview"
        onClose={jest.fn()}
        onSent={jest.fn()}
      />
    )

    await waitFor(() => expect(contractsClient.getSigningPreparationDraft).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '2. Assign Fields' }))
    await waitFor(() => expect(screen.queryByText('Loading draft…')).toBeNull())
    await waitFor(() => expect(screen.getByTestId('pdf-document')).toBeTruthy())
    fireEvent.click(screen.getByTestId('pdf-document'), { clientX: 360, clientY: 500 })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        'contract-1',
        expect.objectContaining({
          fields: [
            {
              field_type: 'SIGNATURE',
              page_number: 1,
              x_position: 306,
              y_position: 396,
              width: 96,
              height: 22,
              anchor_string: undefined,
              assigned_signer_email: 'vendor@nxtwave.co.in',
            },
          ],
        })
      )
    })

    getBoundingClientRectSpy.mockRestore()
    rafSpy.mockRestore()
  })

  it('disables send when recipient has no SIGNATURE field', async () => {
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
        contractStatus="UNDER_REVIEW"
        pdfUrl="/api/contracts/contract-1/preview"
        onClose={jest.fn()}
        onSent={jest.fn()}
      />
    )

    await waitFor(() => expect(contractsClient.getSigningPreparationDraft).toHaveBeenCalled())

    expect(screen.getByRole('button', { name: 'Review & Send' }).hasAttribute('disabled')).toBe(true)
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
            width: 96,
            height: 22,
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
        contractStatus="UNDER_REVIEW"
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
            width: 96,
            height: 22,
            anchor_string: undefined,
            assigned_signer_email: 'vendor@nxtwave.co.in',
          },
        ],
      })
    })
  })

  it('allows parallel routing when all recipients share same order', async () => {
    jest.spyOn(contractsClient, 'getSigningPreparationDraft').mockResolvedValue({
      ok: true,
      data: {
        contractId: 'contract-1',
        recipients: [
          {
            name: 'Signer One',
            email: 'one@nxtwave.co.in',
            recipientType: 'EXTERNAL',
            routingOrder: 1,
          },
          {
            name: 'Signer Two',
            email: 'two@nxtwave.co.in',
            recipientType: 'EXTERNAL',
            routingOrder: 1,
          },
        ],
        fields: [
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 10,
            yPosition: 20,
            width: 96,
            height: 22,
            anchorString: null,
            assignedSignerEmail: 'one@nxtwave.co.in',
          },
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 20,
            yPosition: 30,
            width: 96,
            height: 22,
            anchorString: null,
            assignedSignerEmail: 'two@nxtwave.co.in',
          },
        ],
        createdByEmployeeId: 'employee-1',
        updatedByEmployeeId: 'employee-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    } as never)

    render(
      <PrepareForSigningModal
        isOpen
        contractId="contract-1"
        contractStatus="UNDER_REVIEW"
        pdfUrl="/api/contracts/contract-1/preview"
        onClose={jest.fn()}
        onSent={jest.fn()}
      />
    )

    await waitFor(() => expect(contractsClient.getSigningPreparationDraft).toHaveBeenCalled())

    expect(screen.getByRole('button', { name: 'Review & Send' }).hasAttribute('disabled')).toBe(false)
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
            width: 96,
            height: 22,
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
        contractStatus="UNDER_REVIEW"
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
