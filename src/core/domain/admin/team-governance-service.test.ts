import { AuthorizationError, ValidationError } from '@/core/http/errors'
import {
  TeamGovernanceService,
  type ITeamGovernanceRepository,
  type TeamMutationResult,
  type PrimaryRoleMutationResult,
  type LegalMatrixMutationResult,
  type DepartmentSummary,
} from './team-governance-service'

describe('TeamGovernanceService', () => {
  const baseSession = {
    employeeId: 'a95f5ee5-4426-45cc-b932-ef8f404b389d',
    tenantId: 'f1641825-c9c0-4e79-a4c9-37cc9af53ef6',
    role: 'LEGAL_ADMIN',
  }

  const mockRepository: jest.Mocked<ITeamGovernanceRepository> = {
    listDepartments: jest.fn<Promise<DepartmentSummary[]>, [string]>(),
    createDepartment: jest.fn<
      Promise<TeamMutationResult>,
      [
        {
          tenantId: string
          adminUserId: string
          name: string
          pocEmail: string
          pocName: string
          hodEmail: string
          hodName: string
          reason?: string
        },
      ]
    >(),
    updateDepartment: jest.fn<
      Promise<TeamMutationResult>,
      [
        {
          tenantId: string
          adminUserId: string
          teamId: string
          operation: 'rename' | 'deactivate'
          name?: string
          reason?: string
        },
      ]
    >(),
    assignPrimaryRole: jest.fn<
      Promise<PrimaryRoleMutationResult>,
      [
        {
          tenantId: string
          adminUserId: string
          teamId: string
          newEmail: string
          newName: string
          roleType: 'POC' | 'HOD'
          reason?: string
        },
      ]
    >(),
    setLegalMatrix: jest.fn<
      Promise<LegalMatrixMutationResult>,
      [{ tenantId: string; adminUserId: string; teamId: string; legalUserIds: string[]; reason?: string }]
    >(),
  }

  const service = new TeamGovernanceService(mockRepository)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('enforces tenant presence for isolation', async () => {
    await expect(
      service.listDepartments({
        employeeId: baseSession.employeeId,
        role: baseSession.role,
      })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects non-admin actor roles', async () => {
    await expect(
      service.createDepartment({
        session: {
          employeeId: baseSession.employeeId,
          tenantId: baseSession.tenantId,
          role: 'POC',
        },
        name: 'Finance',
        pocEmail: 'finance.poc@nxtwave.co.in',
        pocName: 'Finance POC',
        hodEmail: 'finance.hod@nxtwave.co.in',
        hodName: 'Finance HOD',
      })
    ).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('delegates primary role assignment with tenant-scoped payload', async () => {
    mockRepository.assignPrimaryRole.mockResolvedValue({
      teamId: '95d8fba8-bf5c-4448-97b4-f6d580a992f2',
      roleType: 'HOD',
      previousEmail: 'old.hod@nxtwave.co.in',
      nextEmail: 'new.hod@nxtwave.co.in',
      beforeStateSnapshot: {},
      afterStateSnapshot: {},
    })

    const result = await service.assignPrimaryRole({
      session: baseSession,
      teamId: '95d8fba8-bf5c-4448-97b4-f6d580a992f2',
      newEmail: 'new.hod@nxtwave.co.in',
      newName: 'New HOD Owner',
      roleType: 'HOD',
      reason: 'HOD reassignment for continuity',
    })

    expect(result.nextEmail).toBe('new.hod@nxtwave.co.in')
    expect(mockRepository.assignPrimaryRole).toHaveBeenCalledWith({
      tenantId: baseSession.tenantId,
      adminUserId: baseSession.employeeId,
      teamId: '95d8fba8-bf5c-4448-97b4-f6d580a992f2',
      newEmail: 'new.hod@nxtwave.co.in',
      newName: 'New HOD Owner',
      roleType: 'HOD',
      reason: 'HOD reassignment for continuity',
    })
  })

  it('updates legal matrix with explicit user list', async () => {
    mockRepository.setLegalMatrix.mockResolvedValue({
      teamId: '95d8fba8-bf5c-4448-97b4-f6d580a992f2',
      activeLegalUserIds: ['00573f06-571d-47db-be57-5dbdb8f9d566', '4fd43ac3-f5fe-44f1-baa3-d4d1f16f47a0'],
      beforeStateSnapshot: {},
      afterStateSnapshot: {},
    })

    const result = await service.setLegalMatrix({
      session: baseSession,
      teamId: '95d8fba8-bf5c-4448-97b4-f6d580a992f2',
      legalUserIds: ['00573f06-571d-47db-be57-5dbdb8f9d566', '4fd43ac3-f5fe-44f1-baa3-d4d1f16f47a0'],
      reason: 'Expand legal reviewer pool',
    })

    expect(result.activeLegalUserIds).toHaveLength(2)
    expect(mockRepository.setLegalMatrix).toHaveBeenCalledWith({
      tenantId: baseSession.tenantId,
      adminUserId: baseSession.employeeId,
      teamId: '95d8fba8-bf5c-4448-97b4-f6d580a992f2',
      legalUserIds: ['00573f06-571d-47db-be57-5dbdb8f9d566', '4fd43ac3-f5fe-44f1-baa3-d4d1f16f47a0'],
      reason: 'Expand legal reviewer pool',
    })
  })
})
