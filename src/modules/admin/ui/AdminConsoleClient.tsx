'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  type AdminAuditLogItem,
  adminClient,
  type AdminDepartmentOption,
  type AdminDepartmentUserGroup,
  type AdminRoleOption,
  type SystemConfigurationPayload,
  type AdminUserOption,
} from '@/core/client/admin-client'
import { routeRegistry } from '@/core/config/route-registry'
import { adminSectionRegistry } from '@/core/config/admin-section-registry'
import type { AdminSectionKey } from '@/core/constants/admin-sections'
import Spinner from '@/components/ui/Spinner'
import ProtectedAppShell from '@/modules/dashboard/ui/ProtectedAppShell'
import TeamManagementSection from '@/modules/admin/ui/sections/TeamManagementSection'
import UserManagementSection from '@/modules/admin/ui/sections/UserManagementSection'
import RoleManagementSection from '@/modules/admin/ui/sections/RoleManagementSection'
import HodPocAssignmentControlSection from '@/modules/admin/ui/sections/HodPocAssignmentControlSection'
import LegalTeamAssignmentMatrixSection from '@/modules/admin/ui/sections/LegalTeamAssignmentMatrixSection'
import SystemConfigurationSection from '@/modules/admin/ui/sections/SystemConfigurationSection'
import AuditLogsViewerSection from '@/modules/admin/ui/sections/AuditLogsViewerSection'
import styles from './admin-console.module.css'

type AdminConsoleClientProps = {
  activeSection?: AdminSectionKey
  session: {
    employeeId: string
    fullName?: string | null
    email?: string | null
    team?: string | null
    role?: string | null
    canAccessApproverHistory?: boolean
  }
}

type AdminConfirmationIntent =
  | { kind: 'replace-primary-role' }
  | { kind: 'deactivate-user' }
  | { kind: 'assign-department-role' }
  | { kind: 'add-legal-matrix' }

const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export default function AdminConsoleClient({ activeSection, session }: AdminConsoleClientProps) {
  const router = useRouter()
  const [roles, setRoles] = useState<AdminRoleOption[]>([])
  const [departments, setDepartments] = useState<AdminDepartmentOption[]>([])
  const [users, setUsers] = useState<AdminUserOption[]>([])
  const [usersByDepartment, setUsersByDepartment] = useState<AdminDepartmentUserGroup[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRoleKey, setSelectedRoleKey] = useState('')
  const [roleOperation, setRoleOperation] = useState<'grant' | 'revoke'>('grant')

  const [teamName, setTeamName] = useState('')
  const [pocEmail, setPocEmail] = useState('')
  const [hodEmail, setHodEmail] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserFullName, setNewUserFullName] = useState('')
  const [assignmentDepartmentId, setAssignmentDepartmentId] = useState('')
  const [assignmentDepartmentRole, setAssignmentDepartmentRole] = useState<'POC' | 'HOD'>('POC')

  const [replaceRoleType, setReplaceRoleType] = useState<'POC' | 'HOD'>('POC')
  const [newRoleEmail, setNewRoleEmail] = useState('')

  const [reason, setReason] = useState('')
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false)
  const [isSubmittingReplace, setIsSubmittingReplace] = useState(false)
  const [isSubmittingUserCreate, setIsSubmittingUserCreate] = useState(false)
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false)
  const [isSubmittingAssignment, setIsSubmittingAssignment] = useState(false)
  const [isSubmittingLegalMatrix, setIsSubmittingLegalMatrix] = useState(false)
  const [isSubmittingRoleChange, setIsSubmittingRoleChange] = useState(false)
  const [isSubmittingSystemConfig, setIsSubmittingSystemConfig] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [confirmationIntent, setConfirmationIntent] = useState<AdminConfirmationIntent | null>(null)
  const [systemConfiguration, setSystemConfiguration] = useState<SystemConfigurationPayload | null>(null)
  const [systemConfigurationReason, setSystemConfigurationReason] = useState('')
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogItem[]>([])
  const [auditLogsSelectedId, setAuditLogsSelectedId] = useState<string | null>(null)
  const [auditLogsCursor, setAuditLogsCursor] = useState<string | null>(null)
  const [auditLogsLimit, setAuditLogsLimit] = useState<number>(25)
  const [auditLogsTotal, setAuditLogsTotal] = useState<number>(0)
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false)
  const [auditFilters, setAuditFilters] = useState({
    query: '',
    action: '',
    resourceType: '',
    userId: '',
    from: '',
    to: '',
  })

  useEffect(() => {
    const loadData = async () => {
      try {
        setToastMessage(null)
        const [rolesResponse, teamsResponse, listUsersResponse, groupedUsersResponse] = await Promise.all([
          adminClient.roles(),
          adminClient.departments(),
          adminClient.users(),
          adminClient.usersByDepartment(),
        ])

        if (!rolesResponse.ok || !rolesResponse.data) {
          setRoles([])
          setSelectedRoleKey('')
        } else {
          const nextRoles = rolesResponse.data.roles
          setRoles(nextRoles)
          setSelectedRoleKey((current) => {
            if (!current) {
              return nextRoles[0]?.roleKey || ''
            }
            return nextRoles.some((role) => role.roleKey === current) ? current : nextRoles[0]?.roleKey || ''
          })
        }

        if (!teamsResponse.ok || !teamsResponse.data) {
          setDepartments([])
          setSelectedTeamId('')
          setAssignmentDepartmentId('')
          setToastMessage(teamsResponse.error?.message ?? 'Failed to load departments')
        } else {
          const nextDepartments = teamsResponse.data.departments
          setDepartments(nextDepartments)
          setSelectedTeamId((current) => {
            if (!current) {
              return nextDepartments[0]?.id || ''
            }

            return nextDepartments.some((department) => department.id === current)
              ? current
              : nextDepartments[0]?.id || ''
          })

          setAssignmentDepartmentId((current) => {
            if (!current) {
              return nextDepartments[0]?.id || ''
            }
            return nextDepartments.some((department) => department.id === current)
              ? current
              : nextDepartments[0]?.id || ''
          })
        }

        if (!listUsersResponse.ok || !listUsersResponse.data) {
          setUsers([])
          setSelectedUserId('')
        } else {
          const nextUsers = listUsersResponse.data.users
          setUsers(nextUsers)
          setSelectedUserId((current) => {
            if (!current) {
              return nextUsers[0]?.id || ''
            }
            return nextUsers.some((user) => user.id === current) ? current : nextUsers[0]?.id || ''
          })
        }

        if (!groupedUsersResponse.ok || !groupedUsersResponse.data) {
          setUsersByDepartment([])
        } else {
          setUsersByDepartment(groupedUsersResponse.data.departments)
        }
      } catch {
        setToastMessage('Failed to load admin team governance data')
      } finally {
        setIsLoading(false)
      }
    }

    void loadData()
  }, [])

  const selectedDepartment = useMemo(
    () => departments.find((department) => department.id === selectedTeamId) ?? null,
    [departments, selectedTeamId]
  )

  const normalizedPocEmail = pocEmail.trim().toLowerCase()
  const normalizedHodEmail = hodEmail.trim().toLowerCase()
  const normalizedNewRoleEmail = newRoleEmail.trim().toLowerCase()

  const isPocEmailValid = normalizedPocEmail.length > 0 && emailPattern.test(normalizedPocEmail)
  const isHodEmailValid = normalizedHodEmail.length > 0 && emailPattern.test(normalizedHodEmail)
  const arePrimaryEmailsDifferent =
    normalizedPocEmail !== '' && normalizedHodEmail !== '' && normalizedPocEmail !== normalizedHodEmail

  const isNewRoleEmailValid = normalizedNewRoleEmail.length > 0 && emailPattern.test(normalizedNewRoleEmail)
  const selectedOppositeRoleEmail =
    replaceRoleType === 'POC'
      ? (selectedDepartment?.hodEmail?.toLowerCase() ?? null)
      : (selectedDepartment?.pocEmail?.toLowerCase() ?? null)
  const isReplacementDifferentFromOtherRole =
    !selectedOppositeRoleEmail || selectedOppositeRoleEmail !== normalizedNewRoleEmail

  const canCreate =
    !isLoading &&
    !isSubmittingCreate &&
    teamName.trim().length >= 2 &&
    isPocEmailValid &&
    isHodEmailValid &&
    arePrimaryEmailsDifferent

  const canReplace =
    !isLoading &&
    !isSubmittingReplace &&
    Boolean(selectedDepartment) &&
    isNewRoleEmailValid &&
    isReplacementDifferentFromOtherRole

  const normalizedNewUserEmail = newUserEmail.trim().toLowerCase()
  const canCreateUser =
    !isLoading &&
    !isSubmittingUserCreate &&
    emailPattern.test(normalizedNewUserEmail) &&
    newUserFullName.trim().length >= 2

  const selectedUser = useMemo(() => users.find((user) => user.id === selectedUserId) ?? null, [users, selectedUserId])

  const canAssignDepartmentRole =
    !isLoading && !isSubmittingAssignment && Boolean(selectedUser) && assignmentDepartmentId.length > 0

  const canAssignLegalMatrix =
    !isLoading &&
    !isSubmittingLegalMatrix &&
    Boolean(selectedDepartment) &&
    Boolean(selectedUser) &&
    (selectedUser?.roles ?? []).includes('LEGAL_TEAM')
  const canChangeRole =
    !isLoading && !isSubmittingRoleChange && Boolean(selectedUser) && selectedRoleKey.trim().length > 0

  const currentSection = adminSectionRegistry.getSectionOrDefault(activeSection)

  const loadSystemConfiguration = async () => {
    const response = await adminClient.systemConfiguration()
    if (!response.ok || !response.data) {
      setToastMessage(response.error?.message ?? 'Failed to load system configuration')
      toast.error(response.error?.message ?? 'Failed to load system configuration')
      return
    }

    setSystemConfiguration(response.data.config)
  }

  useEffect(() => {
    if (currentSection.key !== 'system-configuration') {
      return
    }

    if (systemConfiguration) {
      return
    }

    void loadSystemConfiguration()
  }, [currentSection.key, systemConfiguration])

  const loadAuditLogs = useCallback(
    async (cursor?: string) => {
      setIsLoadingAuditLogs(true)
      try {
        const response = await adminClient.auditLogs({
          query: auditFilters.query || undefined,
          action: auditFilters.action || undefined,
          resourceType: auditFilters.resourceType || undefined,
          userId: auditFilters.userId || undefined,
          from: auditFilters.from || undefined,
          to: auditFilters.to || undefined,
          cursor,
          limit: auditLogsLimit,
        })

        if (!response.ok || !response.data) {
          setToastMessage(response.error?.message ?? 'Failed to load audit logs')
          toast.error(response.error?.message ?? 'Failed to load audit logs')
          return
        }

        setAuditLogs(response.data.logs)
        setAuditLogsSelectedId(response.data.logs[0]?.id ?? null)

        const responseMeta = (
          response as unknown as { meta?: { cursor?: string | null; total?: number; limit?: number } }
        ).meta
        setAuditLogsCursor(responseMeta?.cursor ?? null)
        setAuditLogsTotal(responseMeta?.total ?? response.data.logs.length)
        setAuditLogsLimit(responseMeta?.limit ?? auditLogsLimit)
      } finally {
        setIsLoadingAuditLogs(false)
      }
    },
    [auditFilters, auditLogsLimit]
  )

  useEffect(() => {
    if (currentSection.key !== 'audit-logs-viewer') {
      return
    }

    if (auditLogs.length > 0) {
      return
    }

    void loadAuditLogs()
  }, [currentSection.key, auditLogs.length, loadAuditLogs])

  const refreshAdminData = async () => {
    const [rolesResponse, departmentsResponse, usersResponse, usersByDepartmentResponse] = await Promise.all([
      adminClient.roles(),
      adminClient.departments(),
      adminClient.users(),
      adminClient.usersByDepartment(),
    ])

    if (!rolesResponse.ok || !rolesResponse.data) {
      setRoles([])
      setSelectedRoleKey('')
    } else {
      const refreshedRoles = rolesResponse.data.roles
      setRoles(refreshedRoles)
      setSelectedRoleKey((current) => {
        if (!current) {
          return refreshedRoles[0]?.roleKey ?? ''
        }

        const stillExists = refreshedRoles.some((role) => role.roleKey === current)
        return stillExists ? current : (refreshedRoles[0]?.roleKey ?? '')
      })
    }

    if (!departmentsResponse.ok || !departmentsResponse.data) {
      setToastMessage(departmentsResponse.error?.message ?? 'Failed to load departments')
    } else {
      const refreshedDepartments = departmentsResponse.data.departments
      setDepartments(refreshedDepartments)
      setSelectedTeamId((current) => {
        if (!current) {
          return refreshedDepartments[0]?.id ?? ''
        }

        const stillExists = refreshedDepartments.some((department) => department.id === current)
        return stillExists ? current : (refreshedDepartments[0]?.id ?? '')
      })
    }

    if (!usersResponse.ok || !usersResponse.data) {
      setToastMessage(usersResponse.error?.message ?? 'Failed to load users')
    } else {
      const refreshedUsers = usersResponse.data.users
      setUsers(refreshedUsers)
      setSelectedUserId((current) => {
        if (!current) {
          return refreshedUsers[0]?.id ?? ''
        }
        return refreshedUsers.some((user) => user.id === current) ? current : (refreshedUsers[0]?.id ?? '')
      })
    }

    if (!usersByDepartmentResponse.ok || !usersByDepartmentResponse.data) {
      setUsersByDepartment([])
    } else {
      setUsersByDepartment(usersByDepartmentResponse.data.departments)
    }
  }

  const handleCreateTeam = async () => {
    if (!canCreate) {
      return
    }

    setIsSubmittingCreate(true)
    try {
      const response = await adminClient.createDepartment({
        name: teamName.trim(),
        pocEmail: normalizedPocEmail,
        hodEmail: normalizedHodEmail,
        reason: reason.trim() || undefined,
      })

      if (!response.ok || !response.data) {
        setToastMessage(response.error?.message ?? 'Department creation failed')
        toast.error(response.error?.message ?? 'Department creation failed')
        return
      }

      setTeamName('')
      setPocEmail('')
      setHodEmail('')
      setReason('')
      await refreshAdminData()
      setToastMessage('Department created. Access will be granted on next Microsoft login for mapped emails.')
      toast.success('Department created successfully')
    } finally {
      setIsSubmittingCreate(false)
    }
  }

  const handleReplaceRole = async () => {
    if (!selectedDepartment || !canReplace) {
      return
    }

    setIsSubmittingReplace(true)
    try {
      const response = await adminClient.assignPrimaryRole(selectedDepartment.id, {
        roleType: replaceRoleType,
        newEmail: normalizedNewRoleEmail,
        reason: reason.trim() || undefined,
      })

      if (!response.ok || !response.data) {
        setToastMessage(response.error?.message ?? 'Role replacement failed')
        toast.error(response.error?.message ?? 'Role replacement failed')
        return
      }

      setNewRoleEmail('')
      setReason('')
      await refreshAdminData()
      setToastMessage('Primary role mapping replaced. Old email access is revoked immediately.')
      toast.success('Primary role replaced successfully')
    } finally {
      setIsSubmittingReplace(false)
    }
  }

  const handleCreateUser = async () => {
    if (!canCreateUser) {
      return
    }

    setIsSubmittingUserCreate(true)
    try {
      const response = await adminClient.createUser({
        email: normalizedNewUserEmail,
        fullName: newUserFullName.trim(),
        role: 'LEGAL_TEAM',
        isActive: true,
      })

      if (!response.ok || !response.data) {
        setToastMessage(response.error?.message ?? 'User creation failed')
        toast.error(response.error?.message ?? 'User creation failed')
        return
      }

      setNewUserEmail('')
      setNewUserFullName('')
      await refreshAdminData()
      setToastMessage('User created with default development password: Password@123')
      toast.success('User created successfully')
    } finally {
      setIsSubmittingUserCreate(false)
    }
  }

  const handleToggleUserStatus = async (isActive: boolean) => {
    if (!selectedUser) {
      return
    }

    setIsSubmittingStatus(true)
    try {
      const response = await adminClient.setUserStatus(selectedUser.id, { isActive })
      if (!response.ok || !response.data) {
        setToastMessage(response.error?.message ?? 'Failed to update user status')
        toast.error(response.error?.message ?? 'Failed to update user status')
        return
      }

      await refreshAdminData()
      setToastMessage(`User ${isActive ? 'activated' : 'deactivated'} successfully.`)
      toast.success(`User ${isActive ? 'activated' : 'deactivated'} successfully`)
    } finally {
      setIsSubmittingStatus(false)
    }
  }

  const handleAssignUserDepartmentRole = async () => {
    if (!selectedUser || !canAssignDepartmentRole) {
      return
    }

    setIsSubmittingAssignment(true)
    try {
      const response = await adminClient.assignUserDepartmentRole(selectedUser.id, {
        departmentId: assignmentDepartmentId,
        departmentRole: assignmentDepartmentRole,
      })

      if (!response.ok || !response.data) {
        setToastMessage(response.error?.message ?? 'Failed to assign department role')
        toast.error(response.error?.message ?? 'Failed to assign department role')
        return
      }

      await refreshAdminData()
      setToastMessage('Department role assigned successfully.')
      toast.success('Department role assigned successfully')
    } finally {
      setIsSubmittingAssignment(false)
    }
  }

  const handleAddUserToLegalMatrix = async () => {
    if (!selectedDepartment || !selectedUser || !canAssignLegalMatrix) {
      return
    }

    setIsSubmittingLegalMatrix(true)
    try {
      const legalUserIds = Array.from(
        new Set([selectedUser.id, ...selectedDepartment.legalAssignments.map((assignment) => assignment.userId)])
      )

      const response = await adminClient.setLegalMatrix(selectedDepartment.id, {
        legalUserIds,
      })

      if (!response.ok || !response.data) {
        setToastMessage(response.error?.message ?? 'Failed to update legal assignment matrix')
        toast.error(response.error?.message ?? 'Failed to update legal assignment matrix')
        return
      }

      await refreshAdminData()
      setToastMessage('Legal user mapped successfully.')
      toast.success('Legal assignment matrix updated successfully')
    } finally {
      setIsSubmittingLegalMatrix(false)
    }
  }

  const handleChangeUserRole = async () => {
    if (!selectedUser || !selectedRoleKey || !canChangeRole) {
      return
    }

    setIsSubmittingRoleChange(true)
    try {
      const response = await adminClient.changeUserRole(selectedUser.id, {
        operation: roleOperation,
        roleKey: selectedRoleKey,
      })

      if (!response.ok || !response.data) {
        setToastMessage(response.error?.message ?? 'Failed to update user role')
        toast.error(response.error?.message ?? 'Failed to update user role')
        return
      }

      await refreshAdminData()
      setToastMessage(`Role ${roleOperation} operation applied successfully.`)
      toast.success('Role change applied successfully')
    } finally {
      setIsSubmittingRoleChange(false)
    }
  }

  const handleSaveSystemConfiguration = async () => {
    if (!systemConfiguration || isSubmittingSystemConfig) {
      return
    }

    setIsSubmittingSystemConfig(true)
    try {
      const response = await adminClient.updateSystemConfiguration({
        featureFlags: systemConfiguration.featureFlags,
        securitySessionPolicies: systemConfiguration.securitySessionPolicies,
        defaults: systemConfiguration.defaults,
        reason: systemConfigurationReason.trim() || undefined,
      })

      if (!response.ok || !response.data) {
        setToastMessage(response.error?.message ?? 'Failed to update system configuration')
        toast.error(response.error?.message ?? 'Failed to update system configuration')
        return
      }

      setSystemConfiguration(response.data.config)
      setSystemConfigurationReason('')
      setToastMessage('System configuration updated successfully.')
      toast.success('System configuration saved successfully')
    } finally {
      setIsSubmittingSystemConfig(false)
    }
  }

  const handleExportAuditLogsCsv = () => {
    const exportUrl = adminClient.buildAuditExportUrl({
      query: auditFilters.query || undefined,
      action: auditFilters.action || undefined,
      resourceType: auditFilters.resourceType || undefined,
      userId: auditFilters.userId || undefined,
      from: auditFilters.from || undefined,
      to: auditFilters.to || undefined,
      limit: 1000,
    })

    window.open(exportUrl, '_blank', 'noopener,noreferrer')
  }

  const openConfirmation = (intent: AdminConfirmationIntent) => {
    setConfirmationIntent(intent)
  }

  const closeConfirmation = () => {
    if (isSubmittingReplace || isSubmittingStatus || isSubmittingAssignment || isSubmittingLegalMatrix) {
      return
    }

    setConfirmationIntent(null)
  }

  const confirmationText = useMemo(() => {
    if (!confirmationIntent) {
      return null
    }

    if (confirmationIntent.kind === 'replace-primary-role') {
      return {
        title: 'Confirm Primary Role Replacement',
        body: `Replace ${replaceRoleType} for ${selectedDepartment?.name ?? 'selected department'} with ${normalizedNewRoleEmail}? Existing access for the previous user will be revoked.`,
        confirmLabel: 'Confirm Replace',
      }
    }

    if (confirmationIntent.kind === 'deactivate-user') {
      return {
        title: 'Confirm User Deactivation',
        body: `Deactivate ${selectedUser?.email ?? 'selected user'}? This will revoke active access until reactivated.`,
        confirmLabel: 'Confirm Deactivate',
      }
    }

    if (confirmationIntent.kind === 'assign-department-role') {
      const selectedAssignmentDepartment = departments.find((department) => department.id === assignmentDepartmentId)
      return {
        title: 'Confirm Department Role Assignment',
        body: `Assign ${assignmentDepartmentRole} role for ${selectedUser?.email ?? 'selected user'} in ${selectedAssignmentDepartment?.name ?? 'selected department'}?`,
        confirmLabel: 'Confirm Assign',
      }
    }

    return {
      title: 'Confirm Legal Matrix Update',
      body: `Add ${selectedUser?.email ?? 'selected user'} to legal assignment matrix for ${selectedDepartment?.name ?? 'selected department'}?`,
      confirmLabel: 'Confirm Update',
    }
  }, [
    assignmentDepartmentId,
    assignmentDepartmentRole,
    confirmationIntent,
    departments,
    normalizedNewRoleEmail,
    replaceRoleType,
    selectedDepartment,
    selectedUser,
  ])

  const handleConfirmAction = async () => {
    if (!confirmationIntent) {
      return
    }

    const intent = confirmationIntent
    setConfirmationIntent(null)

    if (intent.kind === 'replace-primary-role') {
      await handleReplaceRole()
      return
    }

    if (intent.kind === 'deactivate-user') {
      await handleToggleUserStatus(false)
      return
    }

    if (intent.kind === 'assign-department-role') {
      await handleAssignUserDepartmentRole()
      return
    }

    await handleAddUserToLegalMatrix()
  }

  return (
    <ProtectedAppShell
      session={{ fullName: session.fullName, email: session.email, team: session.team, role: session.role }}
      activeNav="admin"
      canAccessApproverHistory={session.canAccessApproverHistory}
    >
      <main className={styles.main}>
        <section className={styles.header}>
          <h1 className={styles.title}>Admin Console</h1>
          <p className={styles.subtitle}>{currentSection.label}</p>
        </section>

        <section className={styles.sections}>
          {adminSectionRegistry.sections.map((section) => (
            <button
              key={section.key}
              type="button"
              className={`${styles.sectionItem} ${section.key === currentSection.key ? styles.sectionItemActive : ''}`}
              onClick={() => router.push(routeRegistry.protected.adminSections[section.routeKey])}
            >
              {section.label}
            </button>
          ))}
        </section>

        {toastMessage ? <div className={styles.toast}>{toastMessage}</div> : null}

        <section className={styles.workspaceSingle}>
          {currentSection.key === 'team-management' ? (
            <TeamManagementSection
              teamName={teamName}
              pocEmail={pocEmail}
              hodEmail={hodEmail}
              reason={reason}
              canCreate={canCreate}
              isSubmittingCreate={isSubmittingCreate}
              arePrimaryEmailsDifferent={arePrimaryEmailsDifferent}
              normalizedPocEmail={normalizedPocEmail}
              normalizedHodEmail={normalizedHodEmail}
              onTeamNameChange={setTeamName}
              onPocEmailChange={setPocEmail}
              onHodEmailChange={setHodEmail}
              onReasonChange={setReason}
              onCreateTeam={handleCreateTeam}
            />
          ) : null}

          {currentSection.key === 'user-management' ? (
            <UserManagementSection
              newUserEmail={newUserEmail}
              newUserFullName={newUserFullName}
              users={users}
              selectedUserId={selectedUserId}
              selectedUser={selectedUser}
              canCreateUser={canCreateUser}
              isSubmittingUserCreate={isSubmittingUserCreate}
              isSubmittingStatus={isSubmittingStatus}
              onNewUserEmailChange={setNewUserEmail}
              onNewUserFullNameChange={setNewUserFullName}
              onSelectedUserChange={setSelectedUserId}
              onCreateUser={handleCreateUser}
              onActivateUser={() => {
                void handleToggleUserStatus(true)
              }}
              onDeactivateUser={() => openConfirmation({ kind: 'deactivate-user' })}
            />
          ) : null}

          {currentSection.key === 'role-management' ? (
            <RoleManagementSection
              users={users}
              roles={roles}
              selectedUserId={selectedUserId}
              selectedRoleKey={selectedRoleKey}
              roleOperation={roleOperation}
              canChangeRole={canChangeRole}
              isSubmittingRoleChange={isSubmittingRoleChange}
              onSelectedUserChange={setSelectedUserId}
              onSelectedRoleKeyChange={setSelectedRoleKey}
              onRoleOperationChange={setRoleOperation}
              onSubmitRoleChange={handleChangeUserRole}
            />
          ) : null}

          {currentSection.key === 'hod-poc-assignment-control' ? (
            <HodPocAssignmentControlSection
              departments={departments}
              users={users}
              selectedTeamId={selectedTeamId}
              selectedUserId={selectedUserId}
              assignmentDepartmentId={assignmentDepartmentId}
              assignmentDepartmentRole={assignmentDepartmentRole}
              replaceRoleType={replaceRoleType}
              newRoleEmail={newRoleEmail}
              normalizedNewRoleEmail={normalizedNewRoleEmail}
              canReplace={canReplace}
              canAssignDepartmentRole={canAssignDepartmentRole}
              isSubmittingReplace={isSubmittingReplace}
              isSubmittingAssignment={isSubmittingAssignment}
              isReplacementDifferentFromOtherRole={isReplacementDifferentFromOtherRole}
              onSelectedTeamChange={setSelectedTeamId}
              onReplaceRoleTypeChange={setReplaceRoleType}
              onNewRoleEmailChange={setNewRoleEmail}
              onAssignDepartmentChange={setAssignmentDepartmentId}
              onAssignDepartmentRoleChange={setAssignmentDepartmentRole}
              onSelectedUserChange={setSelectedUserId}
              onReplacePrimaryRole={() => openConfirmation({ kind: 'replace-primary-role' })}
              onAssignDepartmentRole={() => openConfirmation({ kind: 'assign-department-role' })}
            />
          ) : null}

          {currentSection.key === 'legal-team-assignment-matrix' ? (
            <LegalTeamAssignmentMatrixSection
              selectedTeamId={selectedTeamId}
              selectedUserId={selectedUserId}
              departments={departments}
              users={users}
              usersByDepartment={usersByDepartment}
              canAssignLegalMatrix={canAssignLegalMatrix}
              isSubmittingLegalMatrix={isSubmittingLegalMatrix}
              onSelectedTeamChange={setSelectedTeamId}
              onSelectedUserChange={setSelectedUserId}
              onAssignLegalMatrix={() => openConfirmation({ kind: 'add-legal-matrix' })}
            />
          ) : null}

          {currentSection.key === 'system-configuration' ? (
            <SystemConfigurationSection
              config={systemConfiguration}
              reason={systemConfigurationReason}
              isLoading={!systemConfiguration}
              isSubmitting={isSubmittingSystemConfig}
              onReasonChange={setSystemConfigurationReason}
              onToggleFlag={(key, value) => {
                setSystemConfiguration((current) =>
                  current
                    ? {
                        ...current,
                        featureFlags: {
                          ...current.featureFlags,
                          [key]: value,
                        },
                      }
                    : current
                )
              }}
              onSecurityPolicyChange={(key, value) => {
                setSystemConfiguration((current) =>
                  current
                    ? {
                        ...current,
                        securitySessionPolicies: {
                          ...current.securitySessionPolicies,
                          [key]: Number.isFinite(value) ? value : current.securitySessionPolicies[key],
                        },
                      }
                    : current
                )
              }}
              onDefaultChange={(key, value) => {
                setSystemConfiguration((current) =>
                  current
                    ? {
                        ...current,
                        defaults: {
                          ...current.defaults,
                          [key]: value as never,
                        },
                      }
                    : current
                )
              }}
              onSave={handleSaveSystemConfiguration}
            />
          ) : null}
          {currentSection.key === 'audit-logs-viewer' ? (
            <AuditLogsViewerSection
              logs={auditLogs}
              selectedLogId={auditLogsSelectedId}
              isLoading={isLoadingAuditLogs}
              cursor={auditLogsCursor}
              total={auditLogsTotal}
              limit={auditLogsLimit}
              filters={auditFilters}
              onFilterChange={(key, value) => {
                setAuditFilters((current) => ({
                  ...current,
                  [key]: value,
                }))
              }}
              onApplyFilters={() => {
                setAuditLogsCursor(null)
                void loadAuditLogs()
              }}
              onNextPage={() => {
                if (!auditLogsCursor) {
                  return
                }

                void loadAuditLogs(auditLogsCursor)
              }}
              onResetPaging={() => {
                setAuditLogsCursor(null)
                void loadAuditLogs()
              }}
              onSelectLog={setAuditLogsSelectedId}
              onExportCsv={handleExportAuditLogsCsv}
            />
          ) : null}
        </section>

        {confirmationIntent && confirmationText ? (
          <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label={confirmationText.title}>
            <div className={styles.modal}>
              <div className={styles.modalTitle}>{confirmationText.title}</div>
              <div className={styles.modalBody}>{confirmationText.body}</div>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.button}
                  onClick={closeConfirmation}
                  disabled={
                    isSubmittingReplace || isSubmittingStatus || isSubmittingAssignment || isSubmittingLegalMatrix
                  }
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  onClick={() => {
                    void handleConfirmAction()
                  }}
                  disabled={
                    isSubmittingReplace || isSubmittingStatus || isSubmittingAssignment || isSubmittingLegalMatrix
                  }
                >
                  <span className={styles.buttonContent}>
                    {isSubmittingReplace || isSubmittingStatus || isSubmittingAssignment || isSubmittingLegalMatrix ? (
                      <Spinner size={14} />
                    ) : null}
                    {confirmationText.confirmLabel}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </ProtectedAppShell>
  )
}
