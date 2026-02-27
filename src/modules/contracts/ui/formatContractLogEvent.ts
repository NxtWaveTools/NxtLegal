import type { ContractTimelineEvent } from '@/core/client/contracts-client'
import { contractStatusLabels, type ContractStatus } from '@/core/constants/contracts'

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

type FormattedContractLogEvent = {
  id: string
  message: string
  actorLabel: string
  relativeTimestamp: string
  absoluteTimestamp: string
  remark: string | null
  target: string | null
}

const eventTemplates: Record<CanonicalContractLogEventType, string> = {
  CONTRACT_CREATED: '{actor} created this contract.',
  CONTRACT_UPDATED: '{actor} updated this contract.',
  HOD_APPROVED: '{actor} approved the contract as HOD.',
  HOD_REJECTED: '{actor} rejected the contract as HOD.',
  LEGAL_APPROVED: '{actor} approved the contract as Legal.',
  LEGAL_REJECTED: '{actor} rejected the contract as Legal.',
  LEGAL_QUERY_RAISED: '{actor} raised a legal query.',
  LEGAL_STATUS_UPDATED: '{actor} updated the legal workflow status.',
  LEGAL_VOIDED: '{actor} marked this contract as Void Documents.',
  HOD_BYPASSED: '{actor} bypassed HOD approval.',
  CONTRACT_REROUTED_TO_HOD: '{actor} rerouted contract to HOD.',
  LEGAL_OWNER_SET: '{actor} set {target} as legal owner.',
  LEGAL_COLLABORATOR_ADDED: '{actor} added {target} as legal collaborator.',
  LEGAL_COLLABORATOR_REMOVED: '{actor} removed {target} from legal collaborators.',
  ACTIVITY_MESSAGE_ADDED: '{actor} added a discussion message.',
  NOTE_ADDED: '{actor} added a note.',
  ADDITIONAL_APPROVER_ADDED: '{actor} added {target} as an additional approver.',
  ADDITIONAL_APPROVED: '{actor} approved as additional approver.',
  ADDITIONAL_REJECTED: '{actor} rejected as additional approver.',
  ADDITIONAL_BYPASSED: '{actor} bypassed {target} as an additional approver.',
}

const actionMessageOverrides: Record<string, string> = {
  'contract.signatory.added': '{actor} added a signatory.',
  'contract.signatory.sent': '{actor} sent the contract for signing.',
  'contract.signatory.delivered': '{actor} recorded signatory delivery.',
  'contract.signatory.viewed': '{actor} recorded that a signatory viewed the contract.',
  'contract.signatory.signed': '{actor} recorded that a signatory signed the contract.',
  'contract.signatory.completed': '{actor} recorded signing completion.',
  'contract.signatory.declined': '{actor} recorded signatory decline.',
  'contract.signatory.expired': '{actor} recorded signatory expiry.',
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

  if (rawType in eventTemplates) {
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

function formatMessage(template: string, actor: string, target: string | null): string {
  return template.replace('{actor}', actor).replace('{target}', target ?? 'an additional approver')
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

function resolveStatusTransitionMessage(event: ContractTimelineEvent, actor: string): string | null {
  const fromStatusLabel = toStatusLabel(event.metadata?.from_status)
  const toStatusLabelValue = toStatusLabel(event.metadata?.to_status)

  if (fromStatusLabel && toStatusLabelValue && fromStatusLabel !== toStatusLabelValue) {
    return `${actor} changed status from ${fromStatusLabel} to ${toStatusLabelValue}.`
  }

  if (toStatusLabelValue) {
    return `${actor} changed status to ${toStatusLabelValue}.`
  }

  return null
}

function humanizeAction(action: string): string {
  return action
    .replace(/^contract\./, '')
    .replace(/[._]/g, ' ')
    .trim()
}

function resolveActionFallbackMessage(action: string | null | undefined, actor: string): string | null {
  if (!action) {
    return null
  }

  const overrideTemplate = actionMessageOverrides[action]
  if (overrideTemplate) {
    return overrideTemplate.replace('{actor}', actor)
  }

  const humanized = humanizeAction(action)
  if (!humanized) {
    return null
  }

  return `${actor} performed ${humanized}.`
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
  actorLabel: string,
  target: string | null
): string {
  const transitionMessage = resolveStatusTransitionMessage(event, actorLabel)
  if (transitionMessage) {
    return transitionMessage
  }

  if (canonicalType) {
    return formatMessage(eventTemplates[canonicalType], actorLabel, target)
  }

  const fallbackActionMessage = resolveActionFallbackMessage(event.action, actorLabel)
  if (fallbackActionMessage) {
    return fallbackActionMessage
  }

  return 'An action was recorded on this contract.'
}

function formatContractLogEvent(event: ContractTimelineEvent, now: Date = new Date()): FormattedContractLogEvent {
  const actorLabel = event.actorEmail?.trim() || 'System'
  const target = event.targetEmail?.trim() || null
  const remarkSource = event.noteText?.trim() || null
  const canonicalType = resolveCanonicalType(event)
  const message = resolveLogMessage(event, canonicalType, actorLabel, target)

  const timestamp = toValidDate(event.createdAt)

  return {
    id: event.id,
    message,
    actorLabel,
    relativeTimestamp: formatRelativeTimestamp(timestamp, now),
    absoluteTimestamp: formatAbsoluteTimestamp(timestamp),
    remark: formatRemark(remarkSource, canonicalType),
    target,
  }
}

function formatContractLogEvents(events: ContractTimelineEvent[], now: Date = new Date()): FormattedContractLogEvent[] {
  return [...events]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map((event) => formatContractLogEvent(event, now))
}

function isContractNoteEvent(event: ContractTimelineEvent): boolean {
  const canonicalType = resolveCanonicalType(event)
  return canonicalType === 'NOTE_ADDED'
}

export { formatContractLogEvent, formatContractLogEvents, isContractNoteEvent }
export type { FormattedContractLogEvent }
