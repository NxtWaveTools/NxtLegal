import { useState, type FormEvent } from 'react'
import type { ContractDetailResponse } from '@/core/client/contracts-client'
import Spinner from '@/components/ui/Spinner'
import { toast } from 'sonner'
import styles from './contracts-workspace.module.css'

type ApprovalsTabProps = {
  contract: ContractDetailResponse['contract']
  approvers: ContractDetailResponse['additionalApprovers']
  isMutating: boolean
  canManageApprovals: boolean
  canBypassApprovals: boolean
  approverEmail: string
  onApproverEmailChange: (value: string) => void
  onAddApprover: () => Promise<void>
  onRemindApprover: (email?: string) => Promise<void>
  onBypassApprover: (approverId: string, reason: string) => Promise<void>
}

type ApprovalStatus = 'PENDING' | 'NOT_SENT' | 'APPROVED' | 'BYPASSED'

type ApprovalStep = {
  id: string
  stepNumber: number
  approverRole: 'HOD' | 'ADDITIONAL'
  approverLabel: string
  status: ApprovalStatus
  timeLabel: string
}

function resolveStepStatus(input: {
  contractStatus: string
  role: 'HOD' | 'ADDITIONAL'
  additionalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BYPASSED'
}): ApprovalStatus {
  if (input.role === 'HOD') {
    if (input.contractStatus === 'HOD_PENDING') {
      return 'PENDING'
    }

    if (input.contractStatus === 'REJECTED') {
      return 'NOT_SENT'
    }

    return 'APPROVED'
  }

  if (input.additionalStatus === 'APPROVED') {
    return 'APPROVED'
  }

  if (input.additionalStatus === 'PENDING') {
    return 'PENDING'
  }

  if (input.additionalStatus === 'BYPASSED') {
    return 'BYPASSED'
  }

  return 'NOT_SENT'
}

function buildSteps(params: {
  contract: ContractDetailResponse['contract']
  approvers: ContractDetailResponse['additionalApprovers']
}): ApprovalStep[] {
  const steps: ApprovalStep[] = []
  const isHodPending = params.contract.status === 'HOD_PENDING'
  const hodApproverLabel = isHodPending
    ? params.contract.currentAssigneeEmail?.trim() ||
      params.contract.departmentHodName?.trim() ||
      params.contract.departmentHodEmail ||
      'HOD'
    : params.contract.departmentHodName?.trim() ||
      params.contract.departmentHodEmail ||
      params.contract.currentAssigneeEmail?.trim() ||
      'HOD'

  steps.push({
    id: `hod-${params.contract.id}`,
    stepNumber: 1,
    approverRole: 'HOD',
    approverLabel: hodApproverLabel,
    status: resolveStepStatus({
      contractStatus: params.contract.status,
      role: 'HOD',
    }),
    timeLabel: params.contract.hodApprovedAt ? new Date(params.contract.hodApprovedAt).toLocaleString() : '—',
  })

  const sortedApprovers = [...params.approvers].sort((first, second) => first.sequenceOrder - second.sequenceOrder)
  sortedApprovers.forEach((approver, index) => {
    steps.push({
      id: approver.id,
      stepNumber: index + 2,
      approverRole: 'ADDITIONAL',
      approverLabel: approver.approverEmail,
      status: resolveStepStatus({
        contractStatus: params.contract.status,
        role: 'ADDITIONAL',
        additionalStatus: approver.status,
      }),
      timeLabel: approver.approvedAt ? new Date(approver.approvedAt).toLocaleString() : '—',
    })
  })

  return steps
}

function statusClass(status: ApprovalStatus): string {
  if (status === 'APPROVED') {
    return styles.approvalStatusApproved
  }

  if (status === 'PENDING') {
    return styles.approvalStatusPending
  }

  return styles.approvalStatusNotSent
}

export default function ApprovalsTab({
  contract,
  approvers,
  isMutating,
  canManageApprovals,
  canBypassApprovals,
  approverEmail,
  onApproverEmailChange,
  onAddApprover,
  onRemindApprover,
  onBypassApprover,
}: ApprovalsTabProps) {
  const steps = buildSteps({ contract, approvers })
  const [isSubmittingCurrentReminder, setIsSubmittingCurrentReminder] = useState(false)
  const [isSubmittingAddApprover, setIsSubmittingAddApprover] = useState(false)
  const [remindingStepId, setRemindingStepId] = useState<string | null>(null)
  const [isSubmittingBypass, setIsSubmittingBypass] = useState(false)
  const [bypassStep, setBypassStep] = useState<ApprovalStep | null>(null)
  const [bypassReason, setBypassReason] = useState('')

  const handleCurrentReminder = async () => {
    if (isSubmittingCurrentReminder || isMutating) {
      return
    }

    setIsSubmittingCurrentReminder(true)

    try {
      await onRemindApprover()
      toast.success('Reminder sent successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error(errorMessage)
    } finally {
      setIsSubmittingCurrentReminder(false)
    }
  }

  const handleStepReminder = async (step: ApprovalStep) => {
    if (remindingStepId || isMutating) {
      return
    }

    setRemindingStepId(step.id)

    try {
      await onRemindApprover(step.approverRole === 'ADDITIONAL' ? step.approverLabel : undefined)
      toast.success('Approver reminder sent')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error(errorMessage)
    } finally {
      setRemindingStepId(null)
    }
  }

  const handleAddApproval = async () => {
    if (isSubmittingAddApprover || isMutating) {
      return
    }

    if (!approverEmail.trim()) {
      toast.error('Approver email is required')
      return
    }

    setIsSubmittingAddApprover(true)

    try {
      await onAddApprover()
      toast.success('Approver added successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error(errorMessage)
    } finally {
      setIsSubmittingAddApprover(false)
    }
  }

  const handleAddApprovalSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleAddApproval()
  }

  const closeBypassDialog = () => {
    if (isSubmittingBypass) {
      return
    }

    setBypassStep(null)
    setBypassReason('')
  }

  const submitBypass = async () => {
    if (!bypassStep || isSubmittingBypass || isMutating) {
      return
    }

    const trimmedReason = bypassReason.trim()
    if (!trimmedReason) {
      toast.error('Bypass reason is required')
      return
    }

    setIsSubmittingBypass(true)

    try {
      await onBypassApprover(bypassStep.id, trimmedReason)
      toast.success('Approval bypassed successfully')
      setBypassStep(null)
      setBypassReason('')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error(errorMessage)
    } finally {
      setIsSubmittingBypass(false)
    }
  }

  const handleBypassSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submitBypass()
  }

  return (
    <div className={styles.tabSection}>
      <div className={styles.card}>
        <div className={styles.sectionHeaderRow}>
          <div className={styles.sectionTitle}>Approvals</div>
          {canManageApprovals ? (
            <button
              type="button"
              className={`${styles.button} ${styles.buttonGhost}`}
              disabled={
                isMutating || isSubmittingCurrentReminder || Boolean(remindingStepId) || isSubmittingAddApprover
              }
              onClick={() => {
                void handleCurrentReminder()
              }}
            >
              <span className={styles.buttonContent}>
                {isSubmittingCurrentReminder ? <Spinner size={14} /> : null}
                {isSubmittingCurrentReminder ? 'Reminding…' : 'Remind Current Blocker'}
              </span>
            </button>
          ) : null}
        </div>

        <div className={styles.approvalTimeline}>
          {steps.map((step, index) => {
            const canRemindStep = canManageApprovals && step.status === 'PENDING'
            const canBypassStep = canBypassApprovals && step.approverRole === 'ADDITIONAL' && step.status === 'PENDING'

            return (
              <div key={step.id} className={styles.approvalStep}>
                <div className={styles.approvalStepRail}>
                  <div className={styles.approvalStepNumber}>{step.stepNumber}</div>
                  {index < steps.length - 1 ? <div className={styles.approvalStepConnector} /> : null}
                </div>

                <div className={styles.approvalStepCard}>
                  <div className={styles.approvalStepHeaderRow}>
                    <div className={styles.approvalStepRole}>
                      {step.approverRole === 'HOD' ? 'HOD Approval' : 'Additional Approval'}
                    </div>
                    <span className={`${styles.approvalStatusBadge} ${statusClass(step.status)}`}>
                      {step.status === 'NOT_SENT'
                        ? 'Not Sent'
                        : step.status === 'PENDING'
                          ? 'Pending'
                          : step.status === 'BYPASSED'
                            ? 'Bypassed'
                            : 'Approved'}
                    </span>
                  </div>

                  <div className={styles.approvalStepMeta}>POC: {contract.uploadedByEmail}</div>
                  <div className={styles.approvalStepMeta}>Approver: {step.approverLabel}</div>
                  <div className={styles.approvalStepMeta}>Time: {step.timeLabel}</div>

                  {canRemindStep || canBypassStep ? (
                    <div className={styles.approvalStepActions}>
                      {canRemindStep ? (
                        <button
                          type="button"
                          className={styles.button}
                          disabled={
                            isMutating ||
                            isSubmittingCurrentReminder ||
                            isSubmittingAddApprover ||
                            Boolean(remindingStepId) ||
                            isSubmittingBypass
                          }
                          onClick={() => {
                            void handleStepReminder(step)
                          }}
                        >
                          <span className={styles.buttonContent}>
                            {remindingStepId === step.id ? <Spinner size={14} /> : null}
                            {remindingStepId === step.id ? 'Reminding…' : 'Remind'}
                          </span>
                        </button>
                      ) : null}

                      {canBypassStep ? (
                        <button
                          type="button"
                          className={`${styles.button} ${styles.buttonDanger}`}
                          disabled={
                            isMutating ||
                            isSubmittingCurrentReminder ||
                            isSubmittingAddApprover ||
                            Boolean(remindingStepId) ||
                            isSubmittingBypass
                          }
                          onClick={() => {
                            setBypassStep(step)
                            setBypassReason('')
                          }}
                        >
                          <span className={styles.buttonContent}>Bypass</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {canManageApprovals ? (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Add Approval</div>
          <form className={styles.inlineForm} onSubmit={handleAddApprovalSubmit}>
            <input
              type="email"
              className={styles.input}
              placeholder="approver@nxtwave.co.in"
              value={approverEmail}
              onChange={(event) => onApproverEmailChange(event.target.value)}
            />
            <button
              type="submit"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={
                isMutating || isSubmittingAddApprover || isSubmittingCurrentReminder || Boolean(remindingStepId)
              }
            >
              <span className={styles.buttonContent}>
                {isSubmittingAddApprover ? <Spinner size={14} /> : null}
                {isSubmittingAddApprover ? 'Adding…' : '+ Add Approval'}
              </span>
            </button>
          </form>
        </div>
      ) : null}

      {bypassStep ? (
        <div className={styles.actionRemarkOverlay} role="dialog" aria-modal="true" aria-label="Bypass approval reason">
          <form className={styles.actionRemarkModal} onSubmit={handleBypassSubmit}>
            <div className={styles.sectionTitle}>Bypass Approval</div>
            <div className={styles.eventMeta}>Approver: {bypassStep.approverLabel}</div>
            <textarea
              className={styles.textarea}
              value={bypassReason}
              onChange={(event) => setBypassReason(event.target.value)}
              rows={4}
              placeholder="Enter bypass reason"
              autoFocus
            />
            <div className={styles.actionRemarkActions}>
              <button type="button" className={styles.button} onClick={closeBypassDialog} disabled={isSubmittingBypass}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${styles.button} ${styles.buttonDanger}`}
                disabled={isSubmittingBypass || isMutating}
              >
                <span className={styles.buttonContent}>
                  {isSubmittingBypass ? <Spinner size={14} /> : null}
                  {isSubmittingBypass ? 'Bypassing…' : 'Confirm Bypass'}
                </span>
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
