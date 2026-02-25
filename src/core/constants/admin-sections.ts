import { permissionRegistry, type PermissionName } from '@/core/registry/permissions'

export const adminSectionDefinitions = [
  {
    key: 'team-management',
    label: 'Team Management',
    permission: permissionRegistry.manageTeams,
    routeKey: 'teamManagement',
  },
  {
    key: 'user-management',
    label: 'User Management',
    permission: permissionRegistry.manageUsers,
    routeKey: 'userManagement',
  },
  {
    key: 'role-management',
    label: 'Role Management',
    permission: permissionRegistry.manageRoles,
    routeKey: 'roleManagement',
  },
  {
    key: 'hod-poc-assignment-control',
    label: 'HOD & POC Assignment Control',
    permission: permissionRegistry.manageAssignments,
    routeKey: 'hodPocAssignmentControl',
  },
  {
    key: 'legal-team-assignment-matrix',
    label: 'Legal Team Assignment Matrix',
    permission: permissionRegistry.viewWorkflowMatrix,
    routeKey: 'legalTeamAssignmentMatrix',
  },
  {
    key: 'system-configuration',
    label: 'System Configuration',
    permission: permissionRegistry.manageSystemConfig,
    routeKey: 'systemConfiguration',
  },
  {
    key: 'audit-logs-viewer',
    label: 'Audit Logs Viewer',
    permission: permissionRegistry.viewAuditLogs,
    routeKey: 'auditLogsViewer',
  },
] as const satisfies ReadonlyArray<{
  key: string
  label: string
  permission: PermissionName
  routeKey: string
}>

export type AdminSectionDefinition = (typeof adminSectionDefinitions)[number]
export type AdminSectionKey = AdminSectionDefinition['key']

export const defaultAdminSectionKey: AdminSectionKey = 'team-management'
