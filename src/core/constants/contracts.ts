export const contractStatuses = {
  draft: 'DRAFT',
  uploaded: 'UPLOADED',
  hodPending: 'HOD_PENDING',
  hodApproved: 'HOD_APPROVED',
  legalPending: 'LEGAL_PENDING',
  legalQuery: 'LEGAL_QUERY',
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

export const contractStatusLabels: Record<ContractStatus, string> = {
  DRAFT: 'Draft',
  UPLOADED: 'Uploaded',
  HOD_PENDING: 'HOD Pending',
  HOD_APPROVED: 'HOD Approved',
  LEGAL_PENDING: 'Legal Pending',
  LEGAL_QUERY: 'Legal Query',
  FINAL_APPROVED: 'Final Approved',
  REJECTED: 'Rejected',
}
