export const contractStatuses = {
  draft: 'DRAFT',
  uploaded: 'UPLOADED',
  hodPending: 'HOD_PENDING',
  underReview: 'UNDER_REVIEW',
  pendingInternal: 'PENDING_WITH_INTERNAL_STAKEHOLDERS',
  pendingExternal: 'PENDING_WITH_EXTERNAL_STAKEHOLDERS',
  offlineExecution: 'OFFLINE_EXECUTION',
  onHold: 'ON_HOLD',
  completed: 'COMPLETED',
  executed: 'EXECUTED',
  void: 'VOID',
  rejected: 'REJECTED',
} as const

export type ContractStatus = (typeof contractStatuses)[keyof typeof contractStatuses]

export const contractTransitionActions = {
  routeToHod: 'system.route_to_hod',
  hodApprove: 'hod.approve',
  hodReject: 'hod.reject',
  hodBypass: 'hod.bypass',
  legalSetUnderReview: 'legal.set.under_review',
  legalSetPendingInternal: 'legal.set.pending_internal',
  legalSetPendingExternal: 'legal.set.pending_external',
  legalSetOfflineExecution: 'legal.set.offline_execution',
  legalSetOnHold: 'legal.set.on_hold',
  legalSetCompleted: 'legal.set.completed',
  legalVoid: 'legal.void',
  routeToLegal: 'system.route_to_legal',
  legalApprove: 'legal.approve',
  legalReject: 'legal.reject',
  legalQuery: 'legal.query',
  legalReroute: 'legal.query.reroute',
  approverApprove: 'approver.approve',
} as const

export type ContractTransitionAction = (typeof contractTransitionActions)[keyof typeof contractTransitionActions]

export const contractWorkflowRoles = {
  poc: 'POC',
  hod: 'HOD',
  legalTeam: 'LEGAL_TEAM',
  admin: 'ADMIN',
  system: 'SYSTEM',
} as const

export const contractUploadModes = {
  default: 'DEFAULT',
  legalSendForSigning: 'LEGAL_SEND_FOR_SIGNING',
} as const

export type ContractUploadMode = (typeof contractUploadModes)[keyof typeof contractUploadModes]

export const contractWorkflowIdentities = {
  legalDepartmentName: 'Legal and Compliance',
  legalHodEmail: 'legalhod@nxtwave.co.in',
} as const

export type ContractWorkflowRole = (typeof contractWorkflowRoles)[keyof typeof contractWorkflowRoles]

export const contractLegalAssignmentAllowedRoles = [contractWorkflowRoles.legalTeam] as const

export const contractLegalAssignmentEditableStatuses: ContractStatus[] = [
  contractStatuses.underReview,
  contractStatuses.pendingInternal,
  contractStatuses.pendingExternal,
  contractStatuses.offlineExecution,
  contractStatuses.onHold,
  contractStatuses.completed,
]

export const requiredTransitionKeys = [
  `${contractStatuses.draft}:${contractStatuses.hodPending}:${contractTransitionActions.routeToHod}`,
  `${contractStatuses.uploaded}:${contractStatuses.hodPending}:${contractTransitionActions.routeToHod}`,
  `${contractStatuses.hodPending}:${contractStatuses.underReview}:${contractTransitionActions.hodApprove}`,
  `${contractStatuses.hodPending}:${contractStatuses.rejected}:${contractTransitionActions.hodReject}`,
  `${contractStatuses.hodPending}:${contractStatuses.underReview}:${contractTransitionActions.hodBypass}`,
  `${contractStatuses.underReview}:${contractStatuses.hodPending}:${contractTransitionActions.legalReroute}`,
  `${contractStatuses.underReview}:${contractStatuses.completed}:${contractTransitionActions.legalSetCompleted}`,
  `${contractStatuses.underReview}:${contractStatuses.rejected}:${contractTransitionActions.legalReject}`,
  `${contractStatuses.underReview}:${contractStatuses.onHold}:${contractTransitionActions.legalSetOnHold}`,
] as const

export const forbiddenTransitionKeys = [`${contractStatuses.hodPending}:${contractStatuses.completed}`] as const

export const contractStorage = {
  privateBucketName: 'contracts-private',
  signedUrlExpirySeconds: 60 * 10,
} as const

export const contractDocumentKinds = {
  primary: 'PRIMARY',
  counterpartySupporting: 'COUNTERPARTY_SUPPORTING',
  executedContract: 'EXECUTED_CONTRACT',
  auditCertificate: 'AUDIT_CERTIFICATE',
} as const

export const contractDocumentMimeTypes = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
} as const

export const contractDocumentVersioning = {
  initialVersion: 1,
  majorVersionIncrement: 1,
} as const

export const contractDocumentUploadRules = {
  initialAllowedRoles: [contractWorkflowRoles.poc, contractWorkflowRoles.legalTeam] as const,
  replacementAllowedRoles: [contractWorkflowRoles.legalTeam] as const,
  initialAllowedMimeTypes: [contractDocumentMimeTypes.docx] as const,
  replacementAllowedMimeTypes: [contractDocumentMimeTypes.docx, contractDocumentMimeTypes.pdf] as const,
} as const

export const contractSignatoryStatuses = {
  pending: 'PENDING',
  signed: 'SIGNED',
} as const

export type ContractSignatoryStatus = (typeof contractSignatoryStatuses)[keyof typeof contractSignatoryStatuses]

export const contractSignatoryRecipientTypes = {
  internal: 'INTERNAL',
  external: 'EXTERNAL',
} as const

export type ContractSignatoryRecipientType =
  (typeof contractSignatoryRecipientTypes)[keyof typeof contractSignatoryRecipientTypes]

export const contractSignatoryFieldTypes = {
  signature: 'SIGNATURE',
  initial: 'INITIAL',
  stamp: 'STAMP',
  name: 'NAME',
  date: 'DATE',
  time: 'TIME',
  text: 'TEXT',
} as const

export type ContractSignatoryFieldType = (typeof contractSignatoryFieldTypes)[keyof typeof contractSignatoryFieldTypes]

export const contractSignatoryWebhookStatuses = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  viewed: 'VIEWED',
  signed: 'SIGNED',
  completed: 'COMPLETED',
  declined: 'DECLINED',
  expired: 'EXPIRED',
} as const

export type ContractSignatoryWebhookStatus =
  (typeof contractSignatoryWebhookStatuses)[keyof typeof contractSignatoryWebhookStatuses]

export const contractNotificationChannels = {
  email: 'EMAIL',
} as const

export type ContractNotificationChannel =
  (typeof contractNotificationChannels)[keyof typeof contractNotificationChannels]

export const contractNotificationTypes = {
  signatoryLink: 'SIGNATORY_LINK',
  signingCompleted: 'SIGNING_COMPLETED',
  hodApprovalRequested: 'HOD_APPROVAL_REQUESTED',
  approvalReminder: 'APPROVAL_REMINDER',
  additionalApproverAdded: 'ADDITIONAL_APPROVER_ADDED',
  legalInternalAssignment: 'LEGAL_INTERNAL_ASSIGNMENT',
  legalApprovalReceivedHod: 'LEGAL_APPROVAL_RECEIVED_HOD',
  legalApprovalReceivedAdditional: 'LEGAL_APPROVAL_RECEIVED_ADDITIONAL',
  legalReturnedToHod: 'LEGAL_RETURNED_TO_HOD',
  legalContractRejected: 'LEGAL_CONTRACT_REJECTED',
} as const

export type ContractNotificationType = (typeof contractNotificationTypes)[keyof typeof contractNotificationTypes]

export const contractNotificationStatuses = {
  sent: 'SENT',
  failed: 'FAILED',
} as const

export type ContractNotificationStatus =
  (typeof contractNotificationStatuses)[keyof typeof contractNotificationStatuses]

export const contractNotificationPolicy = {
  maxRetries: 2,
  retryBaseDelayMinutes: 1,
  approvalReminderCooldownHours: 24,
} as const

export const contractAuditEvents = {
  signatoryAdded: 'CONTRACT_SIGNATORY_ADDED',
  signatorySent: 'CONTRACT_SIGNATORY_SENT',
  signatoryDelivered: 'CONTRACT_SIGNATORY_DELIVERED',
  signatoryViewed: 'CONTRACT_SIGNATORY_VIEWED',
  signatorySigned: 'CONTRACT_SIGNATORY_SIGNED',
  signatoryCompleted: 'CONTRACT_SIGNATORY_COMPLETED',
  signatoryDeclined: 'CONTRACT_SIGNATORY_DECLINED',
  signatoryExpired: 'CONTRACT_SIGNATORY_EXPIRED',
  approverBypassed: 'CONTRACT_APPROVER_BYPASSED',
} as const

export const contractAuditActions = {
  signatoryAdded: 'contract.signatory.added',
  signatorySent: 'contract.signatory.sent',
  signatoryDelivered: 'contract.signatory.delivered',
  signatoryViewed: 'contract.signatory.viewed',
  signatorySigned: 'contract.signatory.signed',
  signatoryCompleted: 'contract.signatory.completed',
  signatoryDeclined: 'contract.signatory.declined',
  signatoryExpired: 'contract.signatory.expired',
  approverBypassed: 'contract.approver.bypassed',
} as const

export const contractStatusLabels: Record<ContractStatus, string> = {
  DRAFT: 'Draft',
  UPLOADED: 'Uploaded',
  HOD_PENDING: 'HOD Pending',
  UNDER_REVIEW: 'Under Review',
  PENDING_WITH_INTERNAL_STAKEHOLDERS: 'Pending with Internal Stakeholders',
  PENDING_WITH_EXTERNAL_STAKEHOLDERS: 'Pending with External Stakeholders',
  OFFLINE_EXECUTION: 'Offline Execution',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  EXECUTED: 'Executed',
  VOID: 'Voided',
  REJECTED: 'Rejected',
}

export const contractStatusDisplayLabels = {
  legalWaitingForAdditionalApprovers: 'Legal Waiting for Additional Approvers',
} as const

export const contractRepositoryStatuses = {
  hodApprovalPending: 'HOD_APPROVAL_PENDING',
  underReview: 'UNDER_REVIEW',
  offlineExecution: 'OFFLINE_EXECUTION',
  pendingExternal: 'PENDING_WITH_EXTERNAL_STAKEHOLDERS',
  pendingInternal: 'PENDING_WITH_INTERNAL_STAKEHOLDERS',
  onHold: 'ON_HOLD',
  void: 'VOID',
  rejected: 'REJECTED',
  completed: 'COMPLETED',
  executed: 'EXECUTED',
} as const

export type ContractRepositoryStatus = (typeof contractRepositoryStatuses)[keyof typeof contractRepositoryStatuses]

export const contractRepositoryStatusLabels: Record<ContractRepositoryStatus, string> = {
  HOD_APPROVAL_PENDING: 'HOD Approval Pending',
  UNDER_REVIEW: 'Under Review',
  OFFLINE_EXECUTION: 'Offline Execution',
  PENDING_WITH_EXTERNAL_STAKEHOLDERS: 'Pending with External Stakeholders',
  PENDING_WITH_INTERNAL_STAKEHOLDERS: 'Pending with Internal Stakeholders',
  ON_HOLD: 'On Hold',
  VOID: 'Voided',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
  EXECUTED: 'Executed',
}

export const contractRepositoryTatPolicy = {
  businessDays: 7,
  label: '7 business days',
} as const

export const contractRepositoryReportStatusBuckets = {
  executed: [contractStatuses.executed],
  completed: [contractStatuses.completed],
  underReview: [contractStatuses.underReview],
  pendingInternal: [contractStatuses.pendingInternal],
  pendingExternal: [contractStatuses.pendingExternal],
  hodApprovalPending: [contractStatuses.hodPending],
} as const

export const contractRepositoryDepartmentMetricKeys = {
  totalRequestsReceived: 'total_requests_received',
  approved: 'approved',
  rejected: 'rejected',
  completed: 'completed',
  pending: 'pending',
} as const

export const contractRepositoryStatusMetricKeys = {
  executed: 'executed',
  completed: 'completed',
  underReview: 'under_review',
  pendingInternal: 'pending_internal',
  pendingExternal: 'pending_external',
  hodApprovalPending: 'hod_approval_pending',
  tatBreached: 'tat_breached',
} as const

export const contractRepositoryStatusMetricLabels: Record<
  (typeof contractRepositoryStatusMetricKeys)[keyof typeof contractRepositoryStatusMetricKeys],
  string
> = {
  [contractRepositoryStatusMetricKeys.executed]: 'Executed',
  [contractRepositoryStatusMetricKeys.completed]: 'Completed',
  [contractRepositoryStatusMetricKeys.underReview]: 'Under Review',
  [contractRepositoryStatusMetricKeys.pendingInternal]: 'Pending Internal',
  [contractRepositoryStatusMetricKeys.pendingExternal]: 'Pending External',
  [contractRepositoryStatusMetricKeys.hodApprovalPending]: 'HOD Approval Pending',
  [contractRepositoryStatusMetricKeys.tatBreached]: 'TAT Breached',
}

export const contractRepositoryExportFormats = {
  csv: 'csv',
  excel: 'excel',
  pdf: 'pdf',
} as const

export const contractRepositoryExportColumns = {
  requestDate: 'request_date',
  creator: 'creator',
  department: 'department',
  hodApproval: 'hod_approval',
  approvalDate: 'approval_date',
  tat: 'tat',
  contractAging: 'contract_aging',
  status: 'status',
  assignedTo: 'assigned_to',
  tatBreached: 'tat_breached',
  overdueDays: 'overdue_days',
  contractTitle: 'contract_title',
} as const

export const contractRepositoryExportColumnLabels: Record<
  (typeof contractRepositoryExportColumns)[keyof typeof contractRepositoryExportColumns],
  string
> = {
  [contractRepositoryExportColumns.requestDate]: 'Request Date',
  [contractRepositoryExportColumns.creator]: 'Creator',
  [contractRepositoryExportColumns.department]: 'Department',
  [contractRepositoryExportColumns.hodApproval]: 'HOD Approval',
  [contractRepositoryExportColumns.approvalDate]: 'Approval Date',
  [contractRepositoryExportColumns.tat]: 'TAT',
  [contractRepositoryExportColumns.contractAging]: 'Contract Aging',
  [contractRepositoryExportColumns.status]: 'Status',
  [contractRepositoryExportColumns.assignedTo]: 'Assigned To',
  [contractRepositoryExportColumns.tatBreached]: 'TAT Breached',
  [contractRepositoryExportColumns.overdueDays]: 'Overdue Days',
  [contractRepositoryExportColumns.contractTitle]: 'Contract',
}

export const resolveContractStatusDisplayLabel = (params: {
  status: ContractStatus
  hasPendingAdditionalApprovers?: boolean
}): string => {
  if (params.status === contractStatuses.underReview && params.hasPendingAdditionalApprovers) {
    return contractStatusDisplayLabels.legalWaitingForAdditionalApprovers
  }

  return contractStatusLabels[params.status]
}

export const resolveRepositoryStatus = (params: {
  status: ContractStatus
  hasPendingAdditionalApprovers?: boolean
}): ContractRepositoryStatus => {
  if (params.status === contractStatuses.hodPending) {
    return contractRepositoryStatuses.hodApprovalPending
  }

  if (params.status === contractStatuses.pendingInternal) {
    return contractRepositoryStatuses.pendingInternal
  }

  if (params.status === contractStatuses.pendingExternal) {
    return contractRepositoryStatuses.pendingExternal
  }

  if (params.status === contractStatuses.offlineExecution) {
    return contractRepositoryStatuses.offlineExecution
  }

  if (params.status === contractStatuses.underReview && params.hasPendingAdditionalApprovers) {
    return contractRepositoryStatuses.pendingInternal
  }

  if (params.status === contractStatuses.underReview) {
    return contractRepositoryStatuses.underReview
  }

  if (params.status === contractStatuses.completed) {
    return contractRepositoryStatuses.completed
  }

  if (params.status === contractStatuses.executed) {
    return contractRepositoryStatuses.executed
  }

  if (params.status === contractStatuses.void) {
    return contractRepositoryStatuses.void
  }

  if (params.status === contractStatuses.onHold) {
    return contractRepositoryStatuses.onHold
  }

  if (params.status === contractStatuses.rejected) {
    return contractRepositoryStatuses.rejected
  }

  return contractRepositoryStatuses.onHold
}

export const repositoryStatusToWorkflowStatuses: Record<ContractRepositoryStatus, ContractStatus[]> = {
  HOD_APPROVAL_PENDING: [contractStatuses.hodPending],
  UNDER_REVIEW: [contractStatuses.underReview],
  OFFLINE_EXECUTION: [contractStatuses.offlineExecution],
  PENDING_WITH_EXTERNAL_STAKEHOLDERS: [contractStatuses.pendingExternal],
  PENDING_WITH_INTERNAL_STAKEHOLDERS: [contractStatuses.pendingInternal],
  ON_HOLD: [contractStatuses.onHold, contractStatuses.draft, contractStatuses.uploaded],
  VOID: [contractStatuses.void],
  REJECTED: [contractStatuses.rejected],
  COMPLETED: [contractStatuses.completed],
  EXECUTED: [contractStatuses.executed],
}
