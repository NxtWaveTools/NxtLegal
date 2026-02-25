export const contractStatuses = {
  draft: 'DRAFT',
  uploaded: 'UPLOADED',
  hodPending: 'HOD_PENDING',
  hodApproved: 'HOD_APPROVED',
  legalPending: 'LEGAL_PENDING',
  legalQuery: 'LEGAL_QUERY',
  inSignature: 'IN_SIGNATURE',
  finalApproved: 'FINAL_APPROVED',
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

export const contractLegalAssignmentAllowedRoles = [
  contractWorkflowRoles.legalTeam,
  contractWorkflowRoles.admin,
] as const

export const contractLegalAssignmentEditableStatuses: ContractStatus[] = [
  contractStatuses.legalPending,
  contractStatuses.legalQuery,
]

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

export const contractSignatoryStatuses = {
  pending: 'PENDING',
  signed: 'SIGNED',
} as const

export type ContractSignatoryStatus = (typeof contractSignatoryStatuses)[keyof typeof contractSignatoryStatuses]

export const contractAuditEvents = {
  signatoryAdded: 'CONTRACT_SIGNATORY_ADDED',
  signatorySigned: 'CONTRACT_SIGNATORY_SIGNED',
} as const

export const contractAuditActions = {
  signatoryAdded: 'contract.signatory.added',
  signatorySigned: 'contract.signatory.signed',
} as const

export const contractStatusLabels: Record<ContractStatus, string> = {
  DRAFT: 'Draft',
  UPLOADED: 'Uploaded',
  HOD_PENDING: 'HOD Pending',
  HOD_APPROVED: 'HOD Approved',
  LEGAL_PENDING: 'Legal Pending',
  LEGAL_QUERY: 'Legal Query',
  IN_SIGNATURE: 'In Signature',
  FINAL_APPROVED: 'Final Approved',
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
