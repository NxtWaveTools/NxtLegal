export const adminGovernance = {
  adminActorRoles: ['SUPER_ADMIN', 'LEGAL_ADMIN', 'ADMIN'] as const,
  operations: {
    grant: 'grant',
    revoke: 'revoke',
  },
  sessionReauthMessage: 'Your access permissions have been updated. Please login again.',
} as const

export type AdminActorRole = (typeof adminGovernance.adminActorRoles)[number]
export type RoleOperation = (typeof adminGovernance.operations)[keyof typeof adminGovernance.operations]
