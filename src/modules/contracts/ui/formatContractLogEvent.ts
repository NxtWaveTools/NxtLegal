import type { ContractTimelineEvent } from '@/core/client/contracts-client'
import {
  contractSignatoryRecipientTypes,
  contractStatusLabels,
  getContractSignatoryRecipientTypeLabel,
  type ContractSignatoryRecipientType,
  type ContractStatus,
} from '@/core/constants/contracts'

type CanonicalContractLogEventType =
  | 'CONTRACT_CREATED'
  | 'CONTRACT_UPDATED'
  | 'HOD_APPROVED'
  | 'HOD_REJECTED'
  | 'LEGAL_APPROVED'
  | 'LEGAL_REJECTED'
  | 'LEGAL_QUERY_RAISED'
  | 'LEGAL_STATUS_UPDATED'
  | 'LEGAL_VOIDED'
  | 'HOD_BYPASSED'
  | 'CONTRACT_REROUTED_TO_HOD'
  | 'LEGAL_OWNER_SET'
  | 'LEGAL_COLLABORATOR_ADDED'
  | 'LEGAL_COLLABORATOR_REMOVED'
  | 'ACTIVITY_MESSAGE_ADDED'
  | 'NOTE_ADDED'
  | 'ADDITIONAL_APPROVER_ADDED'
  | 'ADDITIONAL_APPROVED'
  | 'ADDITIONAL_REJECTED'
  | 'ADDITIONAL_BYPASSED'
  | 'SIGNATORY_ADDED'
  | 'SIGNATORY_SENT'
  | 'SIGNATORY_DELIVERED'
  | 'SIGNATORY_VIEWED'
  | 'SIGNATORY_SIGNED'
  | 'SIGNATORY_COMPLETED'
  | 'SIGNATORY_DECLINED'
  | 'SIGNATORY_EXPIRED'
  | 'SIGNING_PREPARATION_DRAFT_SAVED'

type TimelineEventCategory = 'SIGNING' | 'APPROVAL' | 'ASSIGNMENT' | 'STATUS' | 'DISCUSSION' | 'GENERAL'

type FormattedContractLogEvent = {
  id: string
  message: string
  actorLabel: string
  category: TimelineEventCategory
  categoryLabel: string
  categoryIcon: string
  relativeTimestamp: string
  absoluteTimestamp: string
  remark: string | null
  target: string | null
}

const categoryLabels: Record<TimelineEventCategory, string> = {
  SIGNING: 'Signing',
  APPROVAL: 'Approval',
  ASSIGNMENT: 'Assignment',
  STATUS: 'Status',
  DISCUSSION: 'Discussion',
  GENERAL: 'General',
}

const categoryIcons: Record<TimelineEventCategory, string> = {
  SIGNING: '✍️',
  APPROVAL: '✅',
  ASSIGNMENT: '👤',
  STATUS: '🔄',
  DISCUSSION: '💬',
  GENERAL: '📝',
}

const knownCanonicalEventTypes = new Set<CanonicalContractLogEventType>([
  'CONTRACT_CREATED',
  'CONTRACT_UPDATED',
  'HOD_APPROVED',
  'HOD_REJECTED',
  'LEGAL_APPROVED',
  'LEGAL_REJECTED',
  'LEGAL_QUERY_RAISED',
  'LEGAL_STATUS_UPDATED',
  'LEGAL_VOIDED',
  'HOD_BYPASSED',
  'CONTRACT_REROUTED_TO_HOD',
  'LEGAL_OWNER_SET',
  'LEGAL_COLLABORATOR_ADDED',
  'LEGAL_COLLABORATOR_REMOVED',
  'ACTIVITY_MESSAGE_ADDED',
  'NOTE_ADDED',
  'ADDITIONAL_APPROVER_ADDED',
  'ADDITIONAL_APPROVED',
  'ADDITIONAL_REJECTED',
  'ADDITIONAL_BYPASSED',
  'SIGNATORY_ADDED',
  'SIGNATORY_SENT',
  'SIGNATORY_DELIVERED',
  'SIGNATORY_VIEWED',
  'SIGNATORY_SIGNED',
  'SIGNATORY_COMPLETED',
  'SIGNATORY_DECLINED',
  'SIGNATORY_EXPIRED',
  'SIGNING_PREPARATION_DRAFT_SAVED',
])

const actionMessageOverrides: Record<string, string> = {
  'contract.legal.send_for_signing.initiated': 'Initiated Send for Signing workflow. Pending Legal HOD review.',
}

const absoluteTimestampFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

function normalizeEventType(rawType?: string | null): CanonicalContractLogEventType | null {
  if (!rawType) {
    return null
  }

  if (knownCanonicalEventTypes.has(rawType as CanonicalContractLogEventType)) {
    return rawType as CanonicalContractLogEventType
  }

  switch (rawType) {
    case 'CONTRACT_NOTE_ADDED':
      return 'NOTE_ADDED'
    case 'CONTRACT_APPROVER_ADDED':
      return 'ADDITIONAL_APPROVER_ADDED'
    case 'CONTRACT_APPROVER_APPROVED':
      return 'ADDITIONAL_APPROVED'
    case 'CONTRACT_APPROVER_REJECTED':
      return 'ADDITIONAL_REJECTED'
    case 'CONTRACT_APPROVER_BYPASSED':
      return 'ADDITIONAL_BYPASSED'
    case 'CONTRACT_BYPASSED':
      return 'HOD_BYPASSED'
    case 'CONTRACT_ASSIGNEE_SET':
      return 'LEGAL_OWNER_SET'
    case 'CONTRACT_COLLABORATOR_ADDED':
      return 'LEGAL_COLLABORATOR_ADDED'
    case 'CONTRACT_COLLABORATOR_REMOVED':
      return 'LEGAL_COLLABORATOR_REMOVED'
    case 'CONTRACT_ACTIVITY_MESSAGE_ADDED':
      return 'ACTIVITY_MESSAGE_ADDED'
    case 'CONTRACT_SIGNATORY_ADDED':
      return 'SIGNATORY_ADDED'
    case 'CONTRACT_SIGNATORY_SENT':
      return 'SIGNATORY_SENT'
    case 'CONTRACT_SIGNATORY_DELIVERED':
      return 'SIGNATORY_DELIVERED'
    case 'CONTRACT_SIGNATORY_VIEWED':
      return 'SIGNATORY_VIEWED'
    case 'CONTRACT_SIGNATORY_SIGNED':
      return 'SIGNATORY_SIGNED'
    case 'CONTRACT_SIGNATORY_COMPLETED':
      return 'SIGNATORY_COMPLETED'
    case 'CONTRACT_SIGNATORY_DECLINED':
      return 'SIGNATORY_DECLINED'
    case 'CONTRACT_SIGNATORY_EXPIRED':
      return 'SIGNATORY_EXPIRED'
    default:
      return null
  }
}

function normalizeFromAction(rawAction: string): CanonicalContractLogEventType | null {
  switch (rawAction) {
    case 'contract.created':
      return 'CONTRACT_CREATED'
    case 'contract.updated':
      return 'CONTRACT_UPDATED'
    case 'contract.hod.approve':
      return 'HOD_APPROVED'
    case 'contract.hod.reject':
      return 'HOD_REJECTED'
    case 'contract.legal.approve':
      return 'LEGAL_APPROVED'
    case 'contract.legal.reject':
      return 'LEGAL_REJECTED'
    case 'contract.legal.query':
      return 'LEGAL_QUERY_RAISED'
    case 'contract.legal.set.under_review':
    case 'contract.legal.set.pending_internal':
    case 'contract.legal.set.pending_external':
    case 'contract.legal.set.offline_execution':
    case 'contract.legal.set.on_hold':
    case 'contract.legal.set.completed':
      return 'LEGAL_STATUS_UPDATED'
    case 'contract.legal.void':
      return 'LEGAL_VOIDED'
    case 'contract.hod.bypass':
      return 'HOD_BYPASSED'
    case 'contract.legal.query.reroute':
      return 'CONTRACT_REROUTED_TO_HOD'
    case 'contract.legal.owner.set':
      return 'LEGAL_OWNER_SET'
    case 'contract.legal.collaborator.added':
      return 'LEGAL_COLLABORATOR_ADDED'
    case 'contract.legal.collaborator.removed':
      return 'LEGAL_COLLABORATOR_REMOVED'
    case 'contract.activity.message.added':
      return 'ACTIVITY_MESSAGE_ADDED'
    case 'contract.note.added':
      return 'NOTE_ADDED'
    case 'contract.approver.added':
      return 'ADDITIONAL_APPROVER_ADDED'
    case 'contract.approver.approved':
      return 'ADDITIONAL_APPROVED'
    case 'contract.approver.rejected':
      return 'ADDITIONAL_REJECTED'
    case 'contract.approver.bypassed':
      return 'ADDITIONAL_BYPASSED'
    case 'contract.signatory.added':
      return 'SIGNATORY_ADDED'
    case 'contract.signatory.sent':
      return 'SIGNATORY_SENT'
    case 'contract.signatory.delivered':
      return 'SIGNATORY_DELIVERED'
    case 'contract.signatory.viewed':
      return 'SIGNATORY_VIEWED'
    case 'contract.signatory.signed':
      return 'SIGNATORY_SIGNED'
    case 'contract.signatory.completed':
      return 'SIGNATORY_COMPLETED'
    case 'contract.signatory.declined':
      return 'SIGNATORY_DECLINED'
    case 'contract.signatory.expired':
      return 'SIGNATORY_EXPIRED'
    case 'contract.signing_preparation_draft.saved':
      return 'SIGNING_PREPARATION_DRAFT_SAVED'
    default:
      return null
  }
}

function resolveCanonicalType(event: ContractTimelineEvent): CanonicalContractLogEventType | null {
  const fromAction = normalizeFromAction(event.action)
  if (fromAction) {
    return fromAction
  }

  const fromEventType = normalizeEventType(event.eventType)
  if (fromEventType) {
    return fromEventType
  }

  if (event.eventType === 'CONTRACT_APPROVED') {
    if (event.actorRole === 'HOD') {
      return 'HOD_APPROVED'
    }

    if (event.actorRole === 'LEGAL_TEAM') {
      return 'LEGAL_APPROVED'
    }
  }

  if (event.eventType === 'CONTRACT_REJECTED') {
    if (event.actorRole === 'HOD') {
      return 'HOD_REJECTED'
    }

    if (event.actorRole === 'LEGAL_TEAM') {
      return 'LEGAL_REJECTED'
    }
  }

  if (event.eventType === 'CONTRACT_TRANSITIONED' && event.actorRole === 'LEGAL_TEAM') {
    return 'LEGAL_QUERY_RAISED'
  }

  return null
}

function formatRelativeTimestamp(timestamp: Date, now: Date): string {
  const diffMs = timestamp.getTime() - now.getTime()
  const absDiffMs = Math.abs(diffMs)

  if (absDiffMs < 60_000) {
    return 'just now'
  }

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  const minuteMs = 60_000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs
  const monthMs = 30 * dayMs
  const yearMs = 365 * dayMs

  if (absDiffMs < hourMs) {
    return rtf.format(Math.round(diffMs / minuteMs), 'minute')
  }

  if (absDiffMs < dayMs) {
    return rtf.format(Math.round(diffMs / hourMs), 'hour')
  }

  if (absDiffMs < monthMs) {
    return rtf.format(Math.round(diffMs / dayMs), 'day')
  }

  if (absDiffMs < yearMs) {
    return rtf.format(Math.round(diffMs / monthMs), 'month')
  }

  return rtf.format(Math.round(diffMs / yearMs), 'year')
}

function formatAbsoluteTimestamp(timestamp: Date): string {
  return absoluteTimestampFormatter.format(timestamp).replace(',', '')
}

function toValidDate(value: string): Date {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return new Date()
  }

  return parsed
}

function getMetadataString(metadata: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata?.[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function getMetadataNumber(metadata: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  for (const key of keys) {
    const value = metadata?.[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return null
}

function isSystemActor(event: ContractTimelineEvent): boolean {
  return !event.actorEmail?.trim() || event.actorRole === 'SYSTEM'
}

function isSignatoryCanonicalType(canonicalType: CanonicalContractLogEventType | null): boolean {
  return (
    canonicalType === 'SIGNATORY_ADDED' ||
    canonicalType === 'SIGNATORY_SENT' ||
    canonicalType === 'SIGNATORY_DELIVERED' ||
    canonicalType === 'SIGNATORY_VIEWED' ||
    canonicalType === 'SIGNATORY_SIGNED' ||
    canonicalType === 'SIGNATORY_COMPLETED' ||
    canonicalType === 'SIGNATORY_DECLINED' ||
    canonicalType === 'SIGNATORY_EXPIRED' ||
    canonicalType === 'SIGNING_PREPARATION_DRAFT_SAVED'
  )
}

function resolveRecipientEmail(event: ContractTimelineEvent): string | null {
  const targetEmail = event.targetEmail?.trim()
  if (targetEmail) {
    return targetEmail
  }

  return getMetadataString(event.metadata, [
    'recipient_email',
    'signatory_email',
    'email',
    'recipientEmail',
    'signatoryEmail',
  ])
}

function resolveActorLabel(
  event: ContractTimelineEvent,
  canonicalType: CanonicalContractLogEventType | null,
  recipientEmail: string | null
): string {
  const actorEmail = event.actorEmail?.trim()
  if (actorEmail) {
    return actorEmail
  }

  if (isSystemActor(event) && isSignatoryCanonicalType(canonicalType)) {
    const recipientTypeLabel = resolveRecipientTypeLabel(getMetadataString(event.metadata, ['recipient_type']))
    if (recipientEmail) {
      return `${recipientTypeLabel ?? 'Counter Party'} signer (${recipientEmail})`
    }

    return `${recipientTypeLabel ?? 'Counter Party'} signer`
  }

  return 'System'
}

function toRecipientSuffix(recipientEmail: string | null): string {
  return recipientEmail ? ` ${recipientEmail}` : ''
}

function resolveRecipientTypeLabel(recipientType: string | null): string | null {
  if (!recipientType) {
    return null
  }

  const normalizedRecipientType = recipientType.trim().toUpperCase()
  if (
    normalizedRecipientType !== contractSignatoryRecipientTypes.internal &&
    normalizedRecipientType !== contractSignatoryRecipientTypes.external
  ) {
    return null
  }

  return getContractSignatoryRecipientTypeLabel(normalizedRecipientType as ContractSignatoryRecipientType)
}

function resolveCategory(canonicalType: CanonicalContractLogEventType | null): TimelineEventCategory {
  switch (canonicalType) {
    case 'HOD_APPROVED':
    case 'HOD_REJECTED':
    case 'LEGAL_APPROVED':
    case 'LEGAL_REJECTED':
    case 'HOD_BYPASSED':
    case 'ADDITIONAL_APPROVED':
    case 'ADDITIONAL_REJECTED':
    case 'ADDITIONAL_BYPASSED':
      return 'APPROVAL'
    case 'LEGAL_OWNER_SET':
    case 'LEGAL_COLLABORATOR_ADDED':
    case 'LEGAL_COLLABORATOR_REMOVED':
    case 'ADDITIONAL_APPROVER_ADDED':
      return 'ASSIGNMENT'
    case 'LEGAL_STATUS_UPDATED':
    case 'LEGAL_VOIDED':
    case 'CONTRACT_REROUTED_TO_HOD':
      return 'STATUS'
    case 'ACTIVITY_MESSAGE_ADDED':
    case 'NOTE_ADDED':
      return 'DISCUSSION'
    case 'SIGNATORY_ADDED':
    case 'SIGNATORY_SENT':
    case 'SIGNATORY_DELIVERED':
    case 'SIGNATORY_VIEWED':
    case 'SIGNATORY_SIGNED':
    case 'SIGNATORY_COMPLETED':
    case 'SIGNATORY_DECLINED':
    case 'SIGNATORY_EXPIRED':
    case 'SIGNING_PREPARATION_DRAFT_SAVED':
      return 'SIGNING'
    default:
      return 'GENERAL'
  }
}

function toStatusLabel(status: unknown): string | null {
  if (typeof status !== 'string') {
    return null
  }

  const normalizedStatus = status.trim().toUpperCase()
  if (!(normalizedStatus in contractStatusLabels)) {
    return null
  }

  return contractStatusLabels[normalizedStatus as ContractStatus]
}

function resolveStatusTransitionMessage(event: ContractTimelineEvent): string | null {
  const fromStatusLabel = toStatusLabel(event.metadata?.from_status)
  const toStatusLabelValue = toStatusLabel(event.metadata?.to_status)

  if (fromStatusLabel && toStatusLabelValue && fromStatusLabel !== toStatusLabelValue) {
    return `Changed status from ${fromStatusLabel} to ${toStatusLabelValue}.`
  }

  if (toStatusLabelValue) {
    return `Changed status to ${toStatusLabelValue}.`
  }

  return null
}

function humanizeAction(action: string): string {
  return action
    .replace(/^contract\./, '')
    .replace(/[._]/g, ' ')
    .trim()
}

function resolveActionFallbackMessage(action: string | null | undefined): string | null {
  if (!action) {
    return null
  }

  const overrideTemplate = actionMessageOverrides[action]
  if (overrideTemplate) {
    return overrideTemplate
  }

  const humanized = humanizeAction(action)
  if (!humanized) {
    return null
  }

  return `Recorded: ${humanized}.`
}

function formatRemark(remark: string | null, canonicalType: CanonicalContractLogEventType | null): string | null {
  if (!remark) {
    return null
  }

  if (canonicalType === 'NOTE_ADDED') {
    return `Note: ${remark}`
  }

  if (canonicalType === 'ACTIVITY_MESSAGE_ADDED') {
    return `Message: ${remark}`
  }

  return `Reason: ${remark}`
}

function resolveLogMessage(
  event: ContractTimelineEvent,
  canonicalType: CanonicalContractLogEventType | null,
  recipientEmail: string | null,
  target: string | null
): string {
  const explicitOverrideMessage = actionMessageOverrides[event.action]
  if (explicitOverrideMessage) {
    return explicitOverrideMessage
  }

  // Prefer explicit skip messages for bypassed approvals even when a
  // status transition is present in metadata. This ensures "Skipped [Role]
  // Approval for [email]" is shown instead of a generic status change.
  if (canonicalType === 'HOD_BYPASSED' || canonicalType === 'ADDITIONAL_BYPASSED') {
    const approverEmailFromMeta = getMetadataString(event.metadata, ['approver_email', 'email', 'recipient_email'])
    const approverEmail = recipientEmail || approverEmailFromMeta || target || null
    const approverRole =
      getMetadataString(event.metadata, ['approver_role', 'role']) ||
      (canonicalType === 'HOD_BYPASSED' ? 'HOD' : 'Additional Approver')

    return `Skipped ${approverRole} Approval for ${approverEmail ?? 'an approver'}.`
  }

  const transitionMessage = resolveStatusTransitionMessage(event)
  if (transitionMessage) {
    return transitionMessage
  }

  const routingOrder = getMetadataNumber(event.metadata, ['routing_order'])
  const recipientType = getMetadataString(event.metadata, ['recipient_type'])

  switch (canonicalType) {
    case 'CONTRACT_CREATED':
      return 'Created this contract.'
    case 'CONTRACT_UPDATED':
      return 'Updated this contract.'
    case 'HOD_APPROVED':
      return 'Approved the contract as HOD.'
    case 'HOD_REJECTED':
      return 'Rejected the contract as HOD.'
    case 'LEGAL_APPROVED':
      return 'Approved the contract as Legal.'
    case 'LEGAL_REJECTED':
      return 'Rejected the contract as Legal.'
    case 'LEGAL_QUERY_RAISED':
      return 'Raised a legal query.'
    case 'LEGAL_STATUS_UPDATED':
      return 'Updated the legal workflow status.'
    case 'LEGAL_VOIDED':
      return 'Marked this contract as Void Documents.'
    case 'CONTRACT_REROUTED_TO_HOD':
      return 'Rerouted the contract to HOD.'
    case 'LEGAL_OWNER_SET':
      return `Set ${target ?? 'a legal owner'} as legal owner.`
    case 'LEGAL_COLLABORATOR_ADDED':
      return `Added ${target ?? 'a user'} as legal collaborator.`
    case 'LEGAL_COLLABORATOR_REMOVED':
      return `Removed ${target ?? 'a user'} from legal collaborators.`
    case 'ACTIVITY_MESSAGE_ADDED':
      return 'Added a discussion message.'
    case 'NOTE_ADDED':
      return 'Added a note.'
    case 'ADDITIONAL_APPROVER_ADDED':
      return `Added ${target ?? 'an approver'} as an additional approver.`
    case 'ADDITIONAL_APPROVED':
      return 'Approved as additional approver.'
    case 'ADDITIONAL_REJECTED':
      return 'Rejected as additional approver.'
    case 'SIGNATORY_ADDED': {
      const recipientTypeLabel = resolveRecipientTypeLabel(recipientType)
      const recipientTypeSuffix = recipientTypeLabel ? `, ${recipientTypeLabel}` : ''
      const routingLabel = typeof routingOrder === 'number' ? `, Order #${routingOrder}` : ''
      return `Added ${target ?? recipientEmail ?? 'a signer'} as signer${recipientTypeSuffix}${routingLabel}.`
    }
    case 'SIGNATORY_SENT':
      return `Sent the contract for signing${toRecipientSuffix(recipientEmail)}.`
    case 'SIGNATORY_DELIVERED':
      return `Delivery confirmed for${toRecipientSuffix(recipientEmail)} via Zoho Sign.`
    case 'SIGNATORY_VIEWED':
      return `Viewed by${toRecipientSuffix(recipientEmail)} via Zoho Sign.`
    case 'SIGNATORY_SIGNED':
      return `Signed by${toRecipientSuffix(recipientEmail)} via Zoho Sign.`
    case 'SIGNATORY_COMPLETED':
      return `Signing completed${toRecipientSuffix(recipientEmail)} via Zoho Sign.`
    case 'SIGNATORY_DECLINED':
      return `Signing declined by${toRecipientSuffix(recipientEmail)} via Zoho Sign.`
    case 'SIGNATORY_EXPIRED':
      return `Signing request expired${toRecipientSuffix(recipientEmail)}.`
    case 'SIGNING_PREPARATION_DRAFT_SAVED': {
      const recipientsCount = getMetadataNumber(event.metadata, ['recipients_count'])
      const fieldsCount = getMetadataNumber(event.metadata, ['fields_count'])
      const recipientsLabel =
        recipientsCount !== null ? `${recipientsCount} recipient${recipientsCount === 1 ? '' : 's'}` : null
      const fieldsLabel = fieldsCount !== null ? `${fieldsCount} field${fieldsCount === 1 ? '' : 's'}` : null
      const contextLabel = [recipientsLabel, fieldsLabel].filter((value): value is string => Boolean(value)).join(', ')

      if (contextLabel) {
        return `Saved signing preparation draft (${contextLabel}).`
      }

      return 'Saved signing preparation draft.'
    }
    default:
      break
  }

  const fallbackActionMessage = resolveActionFallbackMessage(event.action)
  if (fallbackActionMessage) {
    return fallbackActionMessage
  }

  return 'An action was recorded on this contract.'
}

function formatContractLogEvent(event: ContractTimelineEvent, now: Date = new Date()): FormattedContractLogEvent {
  const canonicalType = resolveCanonicalType(event)
  const recipientEmail = resolveRecipientEmail(event)
  const actorLabel = resolveActorLabel(event, canonicalType, recipientEmail)
  const target = event.targetEmail?.trim() || null
  const remarkSource = event.noteText?.trim() || null
  const message = resolveLogMessage(event, canonicalType, recipientEmail, target)
  const category = resolveCategory(canonicalType)

  const timestamp = toValidDate(event.createdAt)

  return {
    id: event.id,
    message,
    actorLabel,
    category,
    categoryLabel: categoryLabels[category],
    categoryIcon: categoryIcons[category],
    relativeTimestamp: formatRelativeTimestamp(timestamp, now),
    absoluteTimestamp: formatAbsoluteTimestamp(timestamp),
    remark: formatRemark(remarkSource, canonicalType),
    target,
  }
}

function isDraftSavedEvent(event: ContractTimelineEvent): boolean {
  const canonicalType = resolveCanonicalType(event)
  return canonicalType === 'SIGNING_PREPARATION_DRAFT_SAVED'
}

function formatContractLogEvents(events: ContractTimelineEvent[], now: Date = new Date()): FormattedContractLogEvent[] {
  const dedupedEvents: ContractTimelineEvent[] = []
  let hasIncludedSigningDraftSaved = false

  const sortedEvents = [...events].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  )

  for (const event of sortedEvents) {
    if (isDraftSavedEvent(event)) {
      if (hasIncludedSigningDraftSaved) {
        continue
      }
      hasIncludedSigningDraftSaved = true
    }

    dedupedEvents.push(event)
  }

  return dedupedEvents.map((event) => formatContractLogEvent(event, now))
}

function isContractNoteEvent(event: ContractTimelineEvent): boolean {
  const canonicalType = resolveCanonicalType(event)
  return canonicalType === 'NOTE_ADDED'
}

export { formatContractLogEvent, formatContractLogEvents, isContractNoteEvent }
export type { FormattedContractLogEvent }
