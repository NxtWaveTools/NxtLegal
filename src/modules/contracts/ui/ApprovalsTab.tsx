import { useState, type FormEvent } from 'react'
import type { ContractDetailResponse } from '@/core/client/contracts-client'
import { publicConfig } from '@/core/config/public-config'
import Spinner from '@/components/ui/Spinner'
import { toast } from 'sonner'
import styles from './contracts-workspace.module.css'

type ApprovalsTabProps = {
  contract: ContractDetailResponse['contract']
  approvers: ContractDetailResponse['additionalApprovers']
  isMutating: boolean
  canManageApprovals: boolean
  canSkipApprovals: boolean
  approverEmail: string
  onApproverEmailChange: (value: string) => void
  onAddApprover: () => Promise<void>
  onRemindApprover: (email?: string) => Promise<void>
  onSkipApprover: (params: { approverRole: 'HOD' | 'ADDITIONAL'; approverId?: string; reason: string }) => Promise<void>
  onSkipRefresh: () => void | Promise<void>
}

type ApprovalStatus = 'PENDING' | 'NOT_SENT' | 'APPROVED' | 'SKIPPED'

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
  hodApprovedAt?: string | null
  role: 'HOD' | 'ADDITIONAL'
  additionalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED' | 'BYPASSED'
}): ApprovalStatus {
  if (input.role === 'HOD') {
    if (input.contractStatus === 'HOD_PENDING') {
      return 'PENDING'
    }

    if (input.contractStatus === 'REJECTED') {
      return 'NOT_SENT'
    }

    if (!input.hodApprovedAt) {
      return 'SKIPPED'
    }

    return 'APPROVED'
  }

  if (input.additionalStatus === 'APPROVED') {
    return 'APPROVED'
  }

  if (input.additionalStatus === 'PENDING') {
    return 'PENDING'
  }

  if (input.additionalStatus === 'SKIPPED' || input.additionalStatus === 'BYPASSED') {
    return 'SKIPPED'
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
      hodApprovedAt: params.contract.hodApprovedAt,
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

const defaultDomain = publicConfig.auth.allowedDomains[0] ?? 'example.com'
const approvalEmailPlaceholder = `approver@${defaultDomain}`

function statusClass(status: ApprovalStatus): string {
  if (status === 'APPROVED') {
    return styles.approvalStatusApproved
  }

  if (status === 'PENDING') {
    return styles.approvalStatusPending
  }

  if (status === 'SKIPPED') {
    return styles.approvalStatusSkipped
  }

  return styles.approvalStatusNotSent
}

export default function ApprovalsTab({
  contract,
  approvers,
  isMutating,
  canManageApprovals,
  canSkipApprovals,
  approverEmail,
  onApproverEmailChange,
  onAddApprover,
  onRemindApprover,
  onSkipApprover,
  onSkipRefresh,
}: ApprovalsTabProps) {
  const steps = buildSteps({ contract, approvers })
  const [isSubmittingCurrentReminder, setIsSubmittingCurrentReminder] = useState(false)
  const [isSubmittingAddApprover, setIsSubmittingAddApprover] = useState(false)
  const [remindingStepId, setRemindingStepId] = useState<string | null>(null)
  const [skipStep, setSkipStep] = useState<ApprovalStep | null>(null)
  const [skipReason, setSkipReason] = useState('')

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

  const closeSkipDialog = () => {
    setSkipStep(null)
    setSkipReason('')
  }

  const submitSkip = async () => {
    if (!skipStep || isMutating) {
      return
    }

    const trimmedReason = skipReason.trim()
    if (!trimmedReason) {
      toast.error('Skip reason is required')
      return
    }

    const activeSkipStep = skipStep
    closeSkipDialog()

    const skipPromise = onSkipApprover({
      approverRole: activeSkipStep.approverRole,
      approverId: activeSkipStep.approverRole === 'ADDITIONAL' ? activeSkipStep.id : undefined,
      reason: trimmedReason,
    }).then(async () => {
      await onSkipRefresh()
    })

    toast.promise(skipPromise, {
      loading: 'Skipping approval...',
      success: 'Approval skipped successfully',
      error: (error) => (error instanceof Error ? error.message : 'An unexpected error occurred'),
    })

    void skipPromise
  }

  const handleSkipSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submitSkip()
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
            const canSkipStep = canSkipApprovals && step.status === 'PENDING'

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
                          : step.status === 'SKIPPED'
                            ? 'Skipped'
                            : 'Approved'}
                    </span>
                  </div>

                  <div className={styles.approvalStepMeta}>POC: {contract.uploadedByEmail}</div>
                  <div className={styles.approvalStepMeta}>Approver: {step.approverLabel}</div>
                  <div className={styles.approvalStepMeta}>Time: {step.timeLabel}</div>

                  {canRemindStep || canSkipStep ? (
                    <div className={styles.approvalStepActions}>
                      {canRemindStep ? (
                        <button
                          type="button"
                          className={styles.button}
                          disabled={
                            isMutating ||
                            isSubmittingCurrentReminder ||
                            isSubmittingAddApprover ||
                            Boolean(remindingStepId)
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

                      {canSkipStep ? (
                        <button
                          type="button"
                          className={`${styles.button} ${styles.buttonDanger}`}
                          disabled={
                            isMutating ||
                            isSubmittingCurrentReminder ||
                            isSubmittingAddApprover ||
                            Boolean(remindingStepId)
                          }
                          onClick={() => {
                            setSkipStep(step)
                            setSkipReason('')
                          }}
                        >
                          <span className={styles.buttonContent}>Skip Approval</span>
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
              placeholder={approvalEmailPlaceholder}
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

      {skipStep ? (
        <div className={styles.actionRemarkOverlay} role="dialog" aria-modal="true" aria-label="Skip approval reason">
          <form className={styles.actionRemarkModal} onSubmit={handleSkipSubmit}>
            <div className={styles.sectionTitle}>Skip Approval</div>
            <div className={styles.eventMeta}>Approver: {skipStep.approverLabel}</div>
            <textarea
              className={styles.textarea}
              value={skipReason}
              onChange={(event) => setSkipReason(event.target.value)}
              rows={4}
              placeholder="Enter skip reason"
              autoFocus
            />
            <div className={styles.actionRemarkActions}>
              <button type="button" className={styles.button} onClick={closeSkipDialog}>
                Cancel
              </button>
              <button type="submit" className={`${styles.button} ${styles.buttonDanger}`} disabled={isMutating}>
                <span className={styles.buttonContent}>Confirm Skip</span>
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
