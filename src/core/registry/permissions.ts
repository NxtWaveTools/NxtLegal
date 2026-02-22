export const permissionRegistry = {
  viewDashboard: 'view:dashboard',
  manageDocuments: 'manage:documents',
  manageCases: 'manage:cases',
  manageSettings: 'manage:settings',
  viewContractAll: 'view:contracts:all',
  viewContractAssigned: 'view:contracts:assigned',
  approveContractHod: 'approve:contracts:hod',
  approveContractLegal: 'approve:contracts:legal',
  addContractNote: 'contracts:notes:add',
  mentionContractUser: 'contracts:mentions:add',
  reassignContract: 'contracts:reassign',
  viewAdminConsole: 'admin:console:view',
  manageTeams: 'admin:teams:manage',
  manageUsers: 'admin:users:manage',
  manageRoles: 'admin:roles:manage',
  manageAssignments: 'admin:assignments:manage',
  viewWorkflowMatrix: 'admin:workflow:matrix:view',
  manageSystemConfig: 'admin:system:config:manage',
  viewAuditLogs: 'admin:audit:view',
  revokeSessions: 'admin:sessions:revoke',
  viewAllDepartments: 'admin:departments:view:all',
  viewAllReports: 'admin:reports:view:all',
} as const

export type PermissionKey = keyof typeof permissionRegistry
export type PermissionName = (typeof permissionRegistry)[PermissionKey]
