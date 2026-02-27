'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  type AdminAuditLogItem,
  adminClient,
  type AdminDepartmentOption,
  type SystemConfigurationPayload,
} from '@/core/client/admin-client'
import { contractUploadModes, contractWorkflowIdentities } from '@/core/constants/contracts'
import ProtectedAppShell from '@/modules/dashboard/ui/ProtectedAppShell'
import ThirdPartyUploadSidebar from '@/modules/contracts/ui/third-party-upload/ThirdPartyUploadSidebar'
import AdminPrimaryActionsSection from '@/modules/admin/ui/sections/AdminPrimaryActionsSection'
import SystemConfigurationSection from '@/modules/admin/ui/sections/SystemConfigurationSection'
import AuditLogsViewerSection from '@/modules/admin/ui/sections/AuditLogsViewerSection'
import CreateNewTeamWizardModal from '@/modules/admin/ui/wizards/CreateNewTeamWizardModal'
import ManageLegalTeamModal from '@/modules/admin/ui/wizards/ManageLegalTeamModal'
import ReplacePocOrHodWizardModal from '@/modules/admin/ui/wizards/ReplacePocOrHodWizardModal'
import styles from './admin-console.module.css'

type AdminConsoleClientProps = {
  activeSection?: string
  session: {
    employeeId: string
    fullName?: string | null
    email?: string | null
    team?: string | null
    role?: string | null
    canAccessApproverHistory?: boolean
  }
}

const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

type AuditFilterState = {
  query: string
  action: string
  resourceType: string
  userId: string
  from: string
  to: string
}

const createEmptyAuditFilters = (): AuditFilterState => ({
  query: '',
  action: '',
  resourceType: '',
  userId: '',
  from: '',
  to: '',
})

export default function AdminConsoleClient({ session }: AdminConsoleClientProps) {
  const normalizedRole = (session.role ?? '').toUpperCase()
  const [departments, setDepartments] = useState<AdminDepartmentOption[]>([])
  const [users, setUsers] = useState<Array<{ id: string; email: string; fullName: string | null; roles: string[] }>>([])
  const [selectedTeamId, setSelectedTeamId] = useState('')

  const [teamName, setTeamName] = useState('')
  const [pocEmail, setPocEmail] = useState('')
  const [pocName, setPocName] = useState('')
  const [hodEmail, setHodEmail] = useState('')
  const [hodName, setHodName] = useState('')

  const [replaceRoleType, setReplaceRoleType] = useState<'POC' | 'HOD'>('POC')
  const [newRoleEmail, setNewRoleEmail] = useState('')
  const [newRoleName, setNewRoleName] = useState('')
  const [isReplaceRevokeConfirmed, setIsReplaceRevokeConfirmed] = useState(false)
  const [newLegalUserEmail, setNewLegalUserEmail] = useState('')
  const [newLegalUserFullName, setNewLegalUserFullName] = useState('')

  const [isCreateTeamWizardOpen, setIsCreateTeamWizardOpen] = useState(false)
  const [isReplaceRoleWizardOpen, setIsReplaceRoleWizardOpen] = useState(false)
  const [isManageLegalTeamModalOpen, setIsManageLegalTeamModalOpen] = useState(false)
  const [isSystemConfigurationModalOpen, setIsSystemConfigurationModalOpen] = useState(false)
  const [isAuditLogsModalOpen, setIsAuditLogsModalOpen] = useState(false)

  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false)
  const [isSubmittingReplace, setIsSubmittingReplace] = useState(false)
  const [isSubmittingLegalMatrix, setIsSubmittingLegalMatrix] = useState(false)
  const [revokingLegalUserId, setRevokingLegalUserId] = useState<string | null>(null)
  const [isSubmittingSystemConfig, setIsSubmittingSystemConfig] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [systemConfiguration, setSystemConfiguration] = useState<SystemConfigurationPayload | null>(null)
  const [systemConfigurationReason, setSystemConfigurationReason] = useState('')
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogItem[]>([])
  const [auditLogsSelectedId, setAuditLogsSelectedId] = useState<string | null>(null)
  const [auditLogsCursor, setAuditLogsCursor] = useState<string | null>(null)
  const [auditLogsLimit, setAuditLogsLimit] = useState<number>(25)
  const [auditLogsTotal, setAuditLogsTotal] = useState<number>(0)
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [isExportingAuditLogs, setIsExportingAuditLogs] = useState(false)
  const [auditDraftFilters, setAuditDraftFilters] = useState<AuditFilterState>(createEmptyAuditFilters)
  const [auditAppliedFilters, setAuditAppliedFilters] = useState<AuditFilterState>(createEmptyAuditFilters)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [teamsResponse, usersResponse] = await Promise.all([adminClient.departments(), adminClient.users()])

        if (!teamsResponse.ok || !teamsResponse.data) {
          setDepartments([])
          setSelectedTeamId('')
          toast.error(teamsResponse.error?.message ?? 'Failed to load departments')
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
        }

        if (!usersResponse.ok || !usersResponse.data) {
          setUsers([])
        } else {
          const nextUsers = usersResponse.data.users
          setUsers(
            nextUsers.map((user) => ({
              id: user.id,
              email: user.email,
              fullName: user.fullName,
              roles: user.roles,
            }))
          )
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
        toast.error(errorMessage)
      } finally {
        setIsLoading(false)
      }
    }

    void loadData()
  }, [])

  const loadSystemConfiguration = async () => {
    const response = await adminClient.systemConfiguration()
    if (!response.ok || !response.data) {
      toast.error(response.error?.message ?? 'Failed to load system configuration')
      return
    }

    setSystemConfiguration(response.data.config)
  }

  useEffect(() => {
    if (systemConfiguration) {
      return
    }

    void loadSystemConfiguration()
  }, [systemConfiguration])

  const loadAuditLogs = useCallback(
    async (params?: { cursor?: string; filters?: AuditFilterState }) => {
      setIsLoadingAuditLogs(true)
      try {
        const effectiveFilters = params?.filters ?? auditAppliedFilters

        const response = await adminClient.auditLogs({
          query: effectiveFilters.query || undefined,
          action: effectiveFilters.action || undefined,
          resourceType: effectiveFilters.resourceType || undefined,
          userId: effectiveFilters.userId || undefined,
          from: effectiveFilters.from || undefined,
          to: effectiveFilters.to || undefined,
          cursor: params?.cursor,
          limit: auditLogsLimit,
        })

        if (!response.ok || !response.data) {
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
    [auditAppliedFilters, auditLogsLimit]
  )

  useEffect(() => {
    if (auditLogs.length > 0) {
      return
    }

    void loadAuditLogs()
  }, [auditLogs.length, loadAuditLogs])

  const selectedDepartment = useMemo(
    () => departments.find((department) => department.id === selectedTeamId) ?? null,
    [departments, selectedTeamId]
  )
  const normalizedPocEmail = pocEmail.trim().toLowerCase()
  const normalizedHodEmail = hodEmail.trim().toLowerCase()
  const normalizedNewRoleEmail = newRoleEmail.trim().toLowerCase()
  const normalizedNewRoleName = newRoleName.trim()
  const normalizedNewLegalUserEmail = newLegalUserEmail.trim().toLowerCase()
  const normalizedNewLegalUserFullName = newLegalUserFullName.trim()
  const normalizedPocName = pocName.trim()
  const normalizedHodName = hodName.trim()

  const isPocEmailValid = normalizedPocEmail.length > 0 && emailPattern.test(normalizedPocEmail)
  const isHodEmailValid = normalizedHodEmail.length > 0 && emailPattern.test(normalizedHodEmail)
  const arePrimaryEmailsDifferent =
    normalizedPocEmail !== '' && normalizedHodEmail !== '' && normalizedPocEmail !== normalizedHodEmail

  const isNewRoleEmailValid = normalizedNewRoleEmail.length > 0 && emailPattern.test(normalizedNewRoleEmail)
  const isNewRoleNameValid = normalizedNewRoleName.length >= 2
  const isNewLegalUserEmailValid =
    normalizedNewLegalUserEmail.length > 0 && emailPattern.test(normalizedNewLegalUserEmail)
  const isNewLegalUserNameValid = normalizedNewLegalUserFullName.length >= 2
  const selectedOppositeRoleEmail =
    replaceRoleType === 'POC'
      ? (selectedDepartment?.hodEmail?.toLowerCase() ?? null)
      : (selectedDepartment?.pocEmail?.toLowerCase() ?? null)
  const selectedCurrentRoleEmail =
    replaceRoleType === 'POC' ? (selectedDepartment?.pocEmail ?? null) : (selectedDepartment?.hodEmail ?? null)
  const isReplacementDifferentFromOtherRole =
    !selectedOppositeRoleEmail || selectedOppositeRoleEmail !== normalizedNewRoleEmail

  const canCreate =
    !isLoading &&
    !isSubmittingCreate &&
    teamName.trim().length >= 2 &&
    normalizedPocName.length >= 2 &&
    normalizedHodName.length >= 2 &&
    isPocEmailValid &&
    isHodEmailValid &&
    arePrimaryEmailsDifferent

  const canReplace =
    !isLoading &&
    !isSubmittingReplace &&
    Boolean(selectedDepartment) &&
    Boolean(selectedCurrentRoleEmail) &&
    isReplaceRevokeConfirmed &&
    isNewRoleEmailValid &&
    isNewRoleNameValid &&
    isReplacementDifferentFromOtherRole

  const legalDepartment = useMemo(
    () =>
      departments.find(
        (department) =>
          department.name.trim().toLowerCase() === contractWorkflowIdentities.legalDepartmentName.trim().toLowerCase()
      ) ?? null,
    [departments]
  )

  const refreshAdminData = async () => {
    const [departmentsResponse, usersResponse] = await Promise.all([adminClient.departments(), adminClient.users()])

    if (!departmentsResponse.ok || !departmentsResponse.data) {
      toast.error(departmentsResponse.error?.message ?? 'Failed to load departments')
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
      toast.error(usersResponse.error?.message ?? 'Failed to load users')
    } else {
      const refreshedUsers = usersResponse.data.users
      setUsers(
        refreshedUsers.map((user) => ({
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roles: user.roles,
        }))
      )
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
        pocName: normalizedPocName,
        hodEmail: normalizedHodEmail,
        hodName: normalizedHodName,
      })

      if (!response.ok || !response.data) {
        toast.error(response.error?.message ?? 'Department creation failed')
        return
      }

      setTeamName('')
      setPocEmail('')
      setPocName('')
      setHodEmail('')
      setHodName('')
      setIsCreateTeamWizardOpen(false)
      await refreshAdminData()
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
        newName: normalizedNewRoleName,
      })

      if (!response.ok || !response.data) {
        toast.error(response.error?.message ?? 'Role replacement failed')
        return
      }

      setNewRoleEmail('')
      setNewRoleName('')
      setIsReplaceRevokeConfirmed(false)
      setIsReplaceRoleWizardOpen(false)
      await refreshAdminData()
      toast.success('Primary role replaced successfully')
    } finally {
      setIsSubmittingReplace(false)
    }
  }

  const handleAddUserToLegalTeam = async () => {
    if (!legalDepartment || !isNewLegalUserEmailValid || !isNewLegalUserNameValid) {
      return
    }

    setIsSubmittingLegalMatrix(true)
    try {
      let legalUserId: string | null = null
      const existingUser = users.find((user) => user.email.toLowerCase() === normalizedNewLegalUserEmail)

      if (existingUser) {
        legalUserId = existingUser.id
        if (!existingUser.roles.includes('LEGAL_TEAM')) {
          const roleResponse = await adminClient.changeUserRole(existingUser.id, {
            operation: 'grant',
            roleKey: 'LEGAL_TEAM',
          })

          if (!roleResponse.ok) {
            toast.error(roleResponse.error?.message ?? 'Failed to grant legal access role')
            return
          }
        }
      } else {
        const createUserResponse = await adminClient.createUser({
          email: normalizedNewLegalUserEmail,
          fullName: normalizedNewLegalUserFullName,
          role: 'LEGAL_TEAM',
          isActive: true,
        })

        if (!createUserResponse.ok || !createUserResponse.data) {
          toast.error(createUserResponse.error?.message ?? 'Failed to create legal user')
          return
        }

        legalUserId = createUserResponse.data.user.id
      }

      const legalUserIds = Array.from(
        new Set(
          [legalUserId, ...legalDepartment.legalAssignments.map((assignment) => assignment.userId)].filter(Boolean)
        )
      ) as string[]

      const response = await adminClient.setLegalMatrix(legalDepartment.id, {
        legalUserIds,
      })

      if (!response.ok || !response.data) {
        toast.error(response.error?.message ?? 'Failed to update legal team assignments')
        return
      }

      setNewLegalUserEmail('')
      setNewLegalUserFullName('')
      await refreshAdminData()
      toast.success('Legal team user added successfully')
    } finally {
      setIsSubmittingLegalMatrix(false)
    }
  }

  const handleRevokeLegalUser = async (userId: string) => {
    if (!legalDepartment || isSubmittingLegalMatrix || revokingLegalUserId) {
      return
    }

    setRevokingLegalUserId(userId)
    try {
      const legalUserIds = legalDepartment.legalAssignments
        .map((assignment) => assignment.userId)
        .filter((assignmentUserId) => assignmentUserId !== userId)

      const response = await adminClient.setLegalMatrix(legalDepartment.id, {
        legalUserIds,
      })

      if (!response.ok || !response.data) {
        toast.error(response.error?.message ?? 'Failed to revoke legal team access')
        return
      }

      await refreshAdminData()
      toast.success('Legal team access revoked successfully')
    } finally {
      setRevokingLegalUserId(null)
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
        toast.error(response.error?.message ?? 'Failed to update system configuration')
        return
      }

      setSystemConfiguration(response.data.config)
      setSystemConfigurationReason('')
      toast.success('System configuration saved successfully')
    } finally {
      setIsSubmittingSystemConfig(false)
    }
  }

  const handleExportAuditLogsCsv = async () => {
    if (isExportingAuditLogs) {
      return
    }

    setIsExportingAuditLogs(true)

    const exportUrl = adminClient.buildAuditExportUrl({
      query: auditAppliedFilters.query || undefined,
      action: auditAppliedFilters.action || undefined,
      resourceType: auditAppliedFilters.resourceType || undefined,
      userId: auditAppliedFilters.userId || undefined,
      from: auditAppliedFilters.from || undefined,
      to: auditAppliedFilters.to || undefined,
      limit: 5000,
    })

    try {
      window.open(exportUrl, '_blank', 'noopener,noreferrer')
      toast.success('Audit logs export started')
    } catch {
      toast.error('Failed to start audit logs export')
    } finally {
      setIsExportingAuditLogs(false)
    }
  }

  const openCreateTeamWizard = () => {
    setIsCreateTeamWizardOpen(true)
  }

  const closeCreateTeamWizard = () => {
    if (isSubmittingCreate) {
      return
    }

    setIsCreateTeamWizardOpen(false)
  }

  const openReplaceRoleWizard = () => {
    setIsReplaceRevokeConfirmed(false)
    setNewRoleEmail('')
    setNewRoleName('')
    setIsReplaceRoleWizardOpen(true)
  }

  const closeReplaceRoleWizard = () => {
    if (isSubmittingReplace) {
      return
    }

    setIsReplaceRoleWizardOpen(false)
    setIsReplaceRevokeConfirmed(false)
    setNewRoleEmail('')
    setNewRoleName('')
  }

  const openManageLegalTeamModal = () => {
    setIsManageLegalTeamModalOpen(true)
  }

  const closeManageLegalTeamModal = () => {
    if (isSubmittingLegalMatrix || revokingLegalUserId) {
      return
    }

    setIsManageLegalTeamModalOpen(false)
    setNewLegalUserEmail('')
    setNewLegalUserFullName('')
  }

  const openSystemConfigurationModal = () => {
    setIsSystemConfigurationModalOpen(true)
  }

  const closeSystemConfigurationModal = () => {
    if (isSubmittingSystemConfig) {
      return
    }

    setIsSystemConfigurationModalOpen(false)
  }

  const openAuditLogsModal = () => {
    setIsAuditLogsModalOpen(true)
  }

  const closeAuditLogsModal = () => {
    setIsAuditLogsModalOpen(false)
  }

  return (
    <ProtectedAppShell
      session={{ fullName: session.fullName, email: session.email, team: session.team, role: session.role }}
      activeNav="admin"
      canAccessApproverHistory={session.canAccessApproverHistory}
      quickAction={
        normalizedRole === 'HOD'
          ? {
              ariaLabel: 'Upload third-party contract',
              onClick: () => setIsUploadOpen(true),
              isActive: isUploadOpen,
            }
          : undefined
      }
    >
      <main className={styles.main}>
        <section className={styles.header}>
          <h1 className={styles.title}>Admin Console</h1>
          <p className={styles.subtitle}>Create teams and replace primary ownership from one workspace.</p>
        </section>

        <section className={styles.workspaceSingle}>
          <AdminPrimaryActionsSection
            onCreateTeamClick={openCreateTeamWizard}
            onReplaceRoleClick={openReplaceRoleWizard}
            onManageLegalTeamClick={openManageLegalTeamModal}
            onSystemConfigClick={openSystemConfigurationModal}
            onAuditLogsClick={openAuditLogsModal}
          />
          {isLoading ? <div className={styles.preview}>Loading teams...</div> : null}
        </section>

        <CreateNewTeamWizardModal
          isOpen={isCreateTeamWizardOpen}
          teamName={teamName}
          pocEmail={pocEmail}
          pocName={pocName}
          hodEmail={hodEmail}
          hodName={hodName}
          isSubmitting={isSubmittingCreate}
          arePrimaryEmailsDifferent={arePrimaryEmailsDifferent}
          onClose={closeCreateTeamWizard}
          onTeamNameChange={setTeamName}
          onPocEmailChange={setPocEmail}
          onPocNameChange={setPocName}
          onHodEmailChange={setHodEmail}
          onHodNameChange={setHodName}
          onSubmit={() => {
            void handleCreateTeam()
          }}
        />

        <ReplacePocOrHodWizardModal
          isOpen={isReplaceRoleWizardOpen}
          departments={departments}
          selectedTeamId={selectedTeamId}
          replaceRoleType={replaceRoleType}
          currentRoleEmail={selectedCurrentRoleEmail}
          newRoleEmail={newRoleEmail}
          newRoleName={newRoleName}
          isReplacementDifferentFromOtherRole={isReplacementDifferentFromOtherRole}
          isRevokeConfirmed={isReplaceRevokeConfirmed}
          isSubmitting={isSubmittingReplace}
          onClose={closeReplaceRoleWizard}
          onSelectedTeamChange={(value) => {
            setSelectedTeamId(value)
            setIsReplaceRevokeConfirmed(false)
          }}
          onReplaceRoleTypeChange={(value) => {
            setReplaceRoleType(value)
            setIsReplaceRevokeConfirmed(false)
          }}
          onNewRoleEmailChange={setNewRoleEmail}
          onNewRoleNameChange={setNewRoleName}
          onRevokeAccess={() => setIsReplaceRevokeConfirmed(true)}
          onSubmit={() => {
            void handleReplaceRole()
          }}
        />

        <ManageLegalTeamModal
          isOpen={isManageLegalTeamModalOpen}
          legalDepartmentName={contractWorkflowIdentities.legalDepartmentName}
          legalAssignments={legalDepartment?.legalAssignments ?? []}
          isLegalDepartmentConfigured={Boolean(legalDepartment)}
          newUserFullName={newLegalUserFullName}
          newUserEmail={newLegalUserEmail}
          isSubmitting={isSubmittingLegalMatrix}
          revokingUserId={revokingLegalUserId}
          onClose={closeManageLegalTeamModal}
          onNewUserFullNameChange={setNewLegalUserFullName}
          onNewUserEmailChange={setNewLegalUserEmail}
          onAddUser={() => {
            void handleAddUserToLegalTeam()
          }}
          onRevokeUser={(userId) => {
            void handleRevokeLegalUser(userId)
          }}
        />

        {isSystemConfigurationModalOpen ? (
          <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="System Configuration">
            <div className={`${styles.modal} ${styles.modalWide}`}>
              <div className={styles.modalActions}>
                <button type="button" className={styles.button} onClick={closeSystemConfigurationModal}>
                  Close
                </button>
              </div>
              <div className={styles.modalScrollable}>
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
              </div>
            </div>
          </div>
        ) : null}

        {isAuditLogsModalOpen ? (
          <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Audit Logs Viewer">
            <div className={`${styles.modal} ${styles.modalWide}`}>
              <div className={styles.modalActions}>
                <button type="button" className={styles.button} onClick={closeAuditLogsModal}>
                  Close
                </button>
              </div>
              <div className={styles.modalScrollable}>
                <AuditLogsViewerSection
                  logs={auditLogs}
                  selectedLogId={auditLogsSelectedId}
                  isLoading={isLoadingAuditLogs}
                  isExporting={isExportingAuditLogs}
                  cursor={auditLogsCursor}
                  total={auditLogsTotal}
                  limit={auditLogsLimit}
                  filters={auditDraftFilters}
                  onFilterChange={(key, value) => {
                    setAuditDraftFilters((current) => ({
                      ...current,
                      [key]: value,
                    }))
                  }}
                  onApplyFilters={() => {
                    setAuditLogsCursor(null)
                    const nextFilters = { ...auditDraftFilters }
                    setAuditAppliedFilters(nextFilters)
                    void loadAuditLogs({ filters: nextFilters })
                  }}
                  onNextPage={() => {
                    if (!auditLogsCursor) {
                      return
                    }

                    void loadAuditLogs({ cursor: auditLogsCursor })
                  }}
                  onResetPaging={() => {
                    setAuditLogsCursor(null)
                    void loadAuditLogs({ filters: auditAppliedFilters })
                  }}
                  onSelectLog={setAuditLogsSelectedId}
                  onExportCsv={() => {
                    void handleExportAuditLogsCsv()
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}

        <ThirdPartyUploadSidebar
          isOpen={isUploadOpen}
          mode={contractUploadModes.default}
          actorRole={session.role ?? undefined}
          onClose={() => setIsUploadOpen(false)}
          onUploaded={async () => {
            await refreshAdminData()
          }}
        />
      </main>
    </ProtectedAppShell>
  )
}
