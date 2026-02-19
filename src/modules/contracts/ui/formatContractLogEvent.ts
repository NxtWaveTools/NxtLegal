import type { ContractTimelineEvent } from '@/core/client/contracts-client'

type CanonicalContractLogEventType =
  | 'CONTRACT_CREATED'
  | 'CONTRACT_UPDATED'
  | 'HOD_APPROVED'
  | 'LEGAL_APPROVED'
  | 'LEGAL_QUERY_RAISED'
  | 'HOD_BYPASSED'
  | 'CONTRACT_REROUTED_TO_HOD'
  | 'NOTE_ADDED'
  | 'ADDITIONAL_APPROVER_ADDED'
  | 'ADDITIONAL_APPROVED'

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
  LEGAL_APPROVED: '{actor} approved the contract as Legal.',
  LEGAL_QUERY_RAISED: '{actor} raised a legal query.',
  HOD_BYPASSED: '{actor} bypassed HOD approval.',
  CONTRACT_REROUTED_TO_HOD: '{actor} rerouted the contract back to HOD.',
  NOTE_ADDED: '{actor} added a note.',
  ADDITIONAL_APPROVER_ADDED: '{actor} added {target} as an additional approver.',
  ADDITIONAL_APPROVED: '{actor} approved as additional approver.',
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
    case 'CONTRACT_BYPASSED':
      return 'HOD_BYPASSED'
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
    case 'contract.legal.approve':
      return 'LEGAL_APPROVED'
    case 'contract.legal.query':
      return 'LEGAL_QUERY_RAISED'
    case 'contract.hod.bypass':
      return 'HOD_BYPASSED'
    case 'contract.legal.query.reroute':
      return 'CONTRACT_REROUTED_TO_HOD'
    case 'contract.note.added':
      return 'NOTE_ADDED'
    case 'contract.approver.added':
      return 'ADDITIONAL_APPROVER_ADDED'
    case 'contract.approver.approved':
      return 'ADDITIONAL_APPROVED'
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

function formatRemark(remark: string | null): string | null {
  if (!remark) {
    return null
  }

  return `Reason: ${remark}`
}

function formatContractLogEvent(event: ContractTimelineEvent, now: Date = new Date()): FormattedContractLogEvent {
  const actorLabel = event.actorEmail?.trim() || 'System'
  const target = event.targetEmail?.trim() || null
  const remarkSource = event.noteText?.trim() || null
  const canonicalType = resolveCanonicalType(event)

  const message = canonicalType
    ? formatMessage(eventTemplates[canonicalType], actorLabel, target)
    : 'An action was recorded on this contract.'

  const timestamp = toValidDate(event.createdAt)

  return {
    id: event.id,
    message,
    actorLabel,
    relativeTimestamp: formatRelativeTimestamp(timestamp, now),
    absoluteTimestamp: formatAbsoluteTimestamp(timestamp),
    remark: formatRemark(remarkSource),
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
