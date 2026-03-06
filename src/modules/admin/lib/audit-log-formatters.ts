export type AuditLogFormatInput = {
  id: string
  userId: string
  action: string
  eventType: string | null
  actorEmail: string | null
  actorRole: string | null
  targetEmail: string | null
  noteText: string | null
  actorName: string | null
  actorResolvedEmail: string | null
  resourceType: string
  resourceId: string
  changes: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

const actionDictionary: Record<string, string> = {
  'admin.system_configuration.updated': 'Updated System Configuration',
  'admin.user.created': 'Created User',
  'admin.user.status.updated': 'Updated User Status',
  'admin.user.legacy_role_synced': 'Synchronized Legacy Role',
  'employee.created': 'Created Employee',
  'employee.deleted': 'Deleted Employee',
  'auth.login': 'User Login Attempt',
  'auth.logout': 'User Logged Out',
  'auth.token_refresh': 'Refreshed Session Token',
  'contract.created': 'Created Contract',
  'contract.updated': 'Updated Contract Details',
  'contract.hod.approve': 'HOD Approved Contract',
  'contract.hod.reject': 'HOD Rejected Contract',
  'contract.hod.bypass': 'HOD Approval Skipped to Legal Team',
  'contract.legal.approve': 'Legal Team Approved Contract',
  'contract.legal.reject': 'Legal Team Rejected Contract',
  'contract.legal.query': 'Legal Team Raised Query',
  'contract.legal.query.reroute': 'Legal Team Rerouted Query to HOD',
  'contract.legal.void': 'Legal Team Voided Contract',
  'contract.legal.send_for_signing.initiated': 'Initiated Send for Signing Workflow',
  'contract.legal.set.under_review': 'Legal Team Marked Contract Under Review',
  'contract.legal.set.pending_internal': 'Legal Team Marked Pending Internal Stakeholders',
  'contract.legal.set.pending_external': 'Legal Team Marked Pending External Stakeholders',
  'contract.legal.set.offline_execution': 'Legal Team Marked Offline Execution',
  'contract.legal.set.on_hold': 'Legal Team Put Contract On Hold',
  'contract.legal.set.completed': 'Legal Team Marked Contract Completed',
  'contract.approver.approve': 'Additional Approver Approved Contract',
  'contract.approver.reject': 'Additional Approver Rejected Contract',
  'contract.legal.metadata.updated': 'Updated Legal Metadata',
  'contract.legal.owner.set': 'Changed Legal Owner',
  'contract.legal.collaborator.added': 'Added Legal Collaborator',
  'contract.legal.collaborator.removed': 'Removed Legal Collaborator',
  'contract.signatory.added': 'Added Signatory',
  'contract.signatory.sent': 'Sent for Signing',
  'contract.signatory.delivered': 'Delivered to Signatory',
  'contract.signatory.viewed': 'Viewed by Signatory',
  'contract.signatory.signed': 'Signed by Signatory',
  'contract.signatory.completed': 'Completed Signing',
  'contract.signatory.declined': 'Declined by Signatory',
  'contract.signatory.expired': 'Signing Expired',
  'contract.signing_preparation_draft.saved': 'Saved Signing Preparation Draft',
  'contract.primary_document.replaced': 'Replaced Primary Document',
  'contract.approver.added': 'Added Additional Approver',
  'contract.approver.approved': 'Additional Approver Approved',
  'contract.approver.rejected': 'Additional Approver Rejected',
  'contract.approver.bypassed': 'Skipped Additional Approver',
  'approver.approve': 'Additional Approver Approved Contract',
  'approver.reject': 'Additional Approver Rejected Contract',
  'contract.note.added': 'Added Contract Note',
  'contract.activity.message.added': 'Added Activity Message',
  'contract.activity.read_state.updated': 'Updated Activity Read State',
  'contract.system.mark_executed': 'Marked Contract as Executed',
  'team.created': 'Created Team',
  'team.renamed': 'Renamed Team',
  'team.deactivated': 'Deactivated Team',
  'team.primary_role.updated': 'Updated Team Primary Role',
  'team.primary_role.assigned_legacy': 'Assigned Department Role (Legacy)',
  'team.owner_names.updated': 'Updated Team Owner Names',
  'team.legal.matrix.updated': 'Updated Legal Assignment Matrix',
  'team.poc.replaced': 'Replaced POC',
  'team.hod.replaced': 'Replaced HOD',
  'role.assigned': 'Assigned Role',
  'role.revoked': 'Revoked Role',
  'session.revoked': 'Revoked Session',
}

const labelDictionary: Record<string, string> = {
  actor_email: 'Actor Email',
  actor_role: 'Actor Role',
  target_email: 'Target Email',
  reason: 'Reason',
  contract_id: 'Contract',
  document_id: 'Document',
  role_key: 'Role',
  operation: 'Operation',
  from_status: 'From Status',
  to_status: 'To Status',
  recipient_type: 'Recipient Type',
  routing_order: 'Routing Order',
  mentions: 'Mentions',
  recipients_count: 'Recipients',
  fields_count: 'Fields',
  token_version_before: 'Token Version Before',
  token_version_after: 'Token Version After',
  previous_is_active: 'Previous Active',
  next_is_active: 'Next Active',
  previous_owner_email: 'Previous Owner',
  next_owner_email: 'Next Owner',
  full_name: 'Full Name',
  is_active: 'Is Active',
}

const humanizeKey = (key: string): string => {
  const normalized = key
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized
    .split(' ')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ')
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isUuid = (value: string): boolean => uuidPattern.test(value)

const truncateUuid = (value: string): string => `…${value.slice(-5)}`

const truncateOpaqueId = (value: string): string => {
  if (value.length <= 14) {
    return value
  }

  return `…${value.slice(-5)}`
}

const stringifyValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '—'
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(', ')
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return String(value)
}

export const formatAuditAction = (action: string): string => {
  return actionDictionary[action] ?? humanizeKey(action)
}

export const formatAuditDate = (value: string): string => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  const datePart = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(parsed)

  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(parsed)

  return `${datePart} - ${timePart}`
}

export const formatAuditActor = (log: AuditLogFormatInput): string => {
  if (log.actorName && (log.actorEmail || log.actorResolvedEmail)) {
    return `${log.actorName} (${log.actorEmail ?? log.actorResolvedEmail})`
  }

  if (log.actorEmail || log.actorResolvedEmail) {
    return log.actorEmail ?? (log.actorResolvedEmail as string)
  }

  if (log.userId === 'SYSTEM') {
    return 'System'
  }

  return log.userId
}

export const formatAuditMetadataEntries = (log: AuditLogFormatInput): Array<{ label: string; value: string }> => {
  const entries: Array<{ label: string; value: string }> = []

  if (log.actorRole) {
    entries.push({ label: 'Actor Role', value: log.actorRole })
  }

  if (log.targetEmail) {
    entries.push({ label: 'Target', value: log.targetEmail })
  }

  if (log.noteText) {
    entries.push({ label: 'Note', value: log.noteText })
  }

  const appendObject = (source: Record<string, unknown> | null | undefined, prefix: string) => {
    if (!source) {
      return
    }

    for (const [key, value] of Object.entries(source)) {
      entries.push({
        label: prefix
          ? `${prefix}: ${labelDictionary[key] ?? humanizeKey(key)}`
          : (labelDictionary[key] ?? humanizeKey(key)),
        value: stringifyValue(value),
      })
    }
  }

  appendObject(log.metadata, '')
  appendObject(log.changes, 'Change')

  if (entries.length === 0) {
    entries.push({ label: 'Details', value: 'No additional metadata' })
  }

  return entries
}

const getFriendlyResourceValue = (log: AuditLogFormatInput): string | null => {
  const metadata = log.metadata ?? {}
  const changes = log.changes ?? {}

  const readText = (record: Record<string, unknown>, key: string): string | null => {
    const value = record[key]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  if (log.resourceType === 'user') {
    return log.targetEmail ?? log.actorResolvedEmail ?? log.actorEmail ?? readText(metadata, 'email')
  }

  if (log.resourceType === 'contract' || log.resourceType === 'contract_activity_read_state') {
    return (
      readText(metadata, 'contract_title') ??
      readText(metadata, 'title') ??
      readText(changes, 'title') ??
      readText(metadata, 'contract_name')
    )
  }

  if (log.resourceType === 'team') {
    return readText(metadata, 'department_name') ?? readText(metadata, 'team_name') ?? readText(changes, 'name')
  }

  return null
}

export const formatAuditResource = (
  log: AuditLogFormatInput
): {
  typeLabel: string
  valueLabel: string
  fullId: string
  display: string
} => {
  const typeLabel = humanizeKey(log.resourceType)
  const friendlyValue = getFriendlyResourceValue(log)

  const valueLabel =
    friendlyValue ??
    (isUuid(log.resourceId)
      ? truncateUuid(log.resourceId)
      : log.resourceId.includes(':')
        ? truncateOpaqueId(log.resourceId)
        : log.resourceId)

  return {
    typeLabel,
    valueLabel,
    fullId: log.resourceId,
    display: `${typeLabel} • ${valueLabel}`,
  }
}
