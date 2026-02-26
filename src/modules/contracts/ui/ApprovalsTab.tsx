import { useState } from 'react'
import type { ContractDetailResponse } from '@/core/client/contracts-client'
import Spinner from '@/components/ui/Spinner'
import { toast } from 'sonner'
import styles from './contracts-workspace.module.css'

type ApprovalsTabProps = {
  contract: ContractDetailResponse['contract']
  approvers: ContractDetailResponse['additionalApprovers']
  isMutating: boolean
  canManageApprovals: boolean
  approverEmail: string
  onApproverEmailChange: (value: string) => void
  onAddApprover: () => Promise<void>
  onRemindApprover: (email?: string) => Promise<void>
}

type ApprovalStatus = 'PENDING' | 'NOT_SENT' | 'APPROVED'

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
  additionalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'
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

  return 'NOT_SENT'
}

function buildSteps(params: {
  contract: ContractDetailResponse['contract']
  approvers: ContractDetailResponse['additionalApprovers']
}): ApprovalStep[] {
  const steps: ApprovalStep[] = []

  steps.push({
    id: `hod-${params.contract.id}`,
    stepNumber: 1,
    approverRole: 'HOD',
    approverLabel: params.contract.departmentHodName?.trim() || params.contract.departmentHodEmail || 'HOD',
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
  approverEmail,
  onApproverEmailChange,
  onAddApprover,
  onRemindApprover,
}: ApprovalsTabProps) {
  const steps = buildSteps({ contract, approvers })
  const [isSubmittingCurrentReminder, setIsSubmittingCurrentReminder] = useState(false)
  const [isSubmittingAddApprover, setIsSubmittingAddApprover] = useState(false)
  const [remindingStepId, setRemindingStepId] = useState<string | null>(null)

  const handleCurrentReminder = async () => {
    if (isSubmittingCurrentReminder || isMutating) {
      return
    }

    setIsSubmittingCurrentReminder(true)

    try {
      await onRemindApprover()
      toast.success('Reminder sent successfully')
    } catch {
      toast.error('Failed to send reminder')
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
    } catch {
      toast.error('Failed to send approver reminder')
    } finally {
      setRemindingStepId(null)
    }
  }

  const handleAddApproval = async () => {
    if (isSubmittingAddApprover || isMutating) {
      return
    }

    setIsSubmittingAddApprover(true)

    try {
      await onAddApprover()
      toast.success('Approver added successfully')
    } catch {
      toast.error('Failed to add approver')
    } finally {
      setIsSubmittingAddApprover(false)
    }
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
                      {step.status === 'NOT_SENT' ? 'Not Sent' : step.status === 'PENDING' ? 'Pending' : 'Approved'}
                    </span>
                  </div>

                  <div className={styles.approvalStepMeta}>POC: {contract.uploadedByEmail}</div>
                  <div className={styles.approvalStepMeta}>Approver: {step.approverLabel}</div>
                  <div className={styles.approvalStepMeta}>Time: {step.timeLabel}</div>

                  {canRemindStep ? (
                    <div className={styles.approvalStepActions}>
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
          <div className={styles.inlineForm}>
            <input
              type="email"
              className={styles.input}
              placeholder="approver@nxtwave.co.in"
              value={approverEmail}
              onChange={(event) => onApproverEmailChange(event.target.value)}
            />
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={
                isMutating || isSubmittingAddApprover || isSubmittingCurrentReminder || Boolean(remindingStepId)
              }
              onClick={() => {
                void handleAddApproval()
              }}
            >
              <span className={styles.buttonContent}>
                {isSubmittingAddApprover ? <Spinner size={14} /> : null}
                {isSubmittingAddApprover ? 'Adding…' : '+ Add Approval'}
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
