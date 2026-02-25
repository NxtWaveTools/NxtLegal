export const contractStatuses = {
  draft: 'DRAFT',
  uploaded: 'UPLOADED',
  hodPending: 'HOD_PENDING',
  hodApproved: 'HOD_APPROVED',
  legalPending: 'LEGAL_PENDING',
  legalQuery: 'LEGAL_QUERY',
  finalApproved: 'FINAL_APPROVED',
  inSignature: 'IN_SIGNATURE',
  rejected: 'REJECTED',
} as const

export type ContractStatus = (typeof contractStatuses)[keyof typeof contractStatuses]

export const contractTransitionActions = {
  routeToHod: 'system.route_to_hod',
  hodApprove: 'hod.approve',
  hodReject: 'hod.reject',
  hodBypass: 'hod.bypass',
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

export type ContractWorkflowRole = (typeof contractWorkflowRoles)[keyof typeof contractWorkflowRoles]

export const requiredTransitionKeys = [
  `${contractStatuses.draft}:${contractStatuses.hodPending}:${contractTransitionActions.routeToHod}`,
  `${contractStatuses.uploaded}:${contractStatuses.hodPending}:${contractTransitionActions.routeToHod}`,
  `${contractStatuses.hodPending}:${contractStatuses.hodApproved}:${contractTransitionActions.hodApprove}`,
  `${contractStatuses.hodPending}:${contractStatuses.rejected}:${contractTransitionActions.hodReject}`,
  `${contractStatuses.hodPending}:${contractStatuses.legalPending}:${contractTransitionActions.hodBypass}`,
  `${contractStatuses.hodApproved}:${contractStatuses.legalPending}:${contractTransitionActions.routeToLegal}`,
  `${contractStatuses.legalPending}:${contractStatuses.finalApproved}:${contractTransitionActions.legalApprove}`,
  `${contractStatuses.legalPending}:${contractStatuses.rejected}:${contractTransitionActions.legalReject}`,
  `${contractStatuses.legalPending}:${contractStatuses.legalQuery}:${contractTransitionActions.legalQuery}`,
] as const

export const forbiddenTransitionKeys = [`${contractStatuses.hodPending}:${contractStatuses.finalApproved}`] as const

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
  initialAllowedRoles: [contractWorkflowRoles.poc] as const,
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
} as const

export const contractStatusLabels: Record<ContractStatus, string> = {
  DRAFT: 'Draft',
  UPLOADED: 'Uploaded',
  HOD_PENDING: 'HOD Pending',
  HOD_APPROVED: 'HOD Approved',
  LEGAL_PENDING: 'Legal Pending',
  LEGAL_QUERY: 'Legal Query',
  FINAL_APPROVED: 'Final Approved',
  IN_SIGNATURE: 'In Signature',
  REJECTED: 'Rejected',
}

export const contractStatusDisplayLabels = {
  legalWaitingForAdditionalApprovers: 'Legal Waiting for Additional Approvers',
} as const

export const resolveContractStatusDisplayLabel = (params: {
  status: ContractStatus
  hasPendingAdditionalApprovers?: boolean
}): string => {
  if (params.status === contractStatuses.legalPending && params.hasPendingAdditionalApprovers) {
    return contractStatusDisplayLabels.legalWaitingForAdditionalApprovers
  }

  return contractStatusLabels[params.status]
}
