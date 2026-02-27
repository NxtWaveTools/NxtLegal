let state: {
  teams: Array<{
    id: string
    name: string
    is_active: boolean | null
    poc_name: string | null
    hod_name: string | null
  }>
  roleMappings: Array<{ team_id: string; email: string; role_type: 'POC' | 'HOD' }>
  legalAssignments: Array<{ department_id: string; user_id: string }>
  users: Array<{
    id: string
    email: string
    full_name: string | null
    role?: string
    is_active?: boolean
    deleted_at?: string | null
  }>
}

function createSupabaseMock() {
  return {
    from(table: string) {
      const filters: {
        tenantId?: string
        role?: string
        ids?: string[]
      } = {}
      let orderCallCount = 0

      const builder = {
        select() {
          return builder
        },
        eq(column: string, value: unknown) {
          if (column === 'tenant_id') {
            filters.tenantId = String(value)
          }
          if (column === 'role') {
            filters.role = String(value)
          }
          return builder
        },
        is() {
          return builder
        },
        in(column: string, values: string[]) {
          if (table === 'teams') {
            const teamIds = new Set(values)
            return Promise.resolve({
              data: state.teams.filter((team) => teamIds.has(team.id)),
              error: null,
            })
          }

          if (table === 'team_role_mappings') {
            return Promise.resolve({ data: state.roleMappings, error: null })
          }

          if (table === 'department_legal_assignments') {
            return Promise.resolve({ data: state.legalAssignments, error: null })
          }

          if (table === 'users' && column === 'id') {
            filters.ids = values
            const ids = new Set(values)
            return Promise.resolve({
              data: state.users.filter((user) => ids.has(user.id)),
              error: null,
            })
          }

          return Promise.resolve({ data: [], error: null })
        },
        order() {
          orderCallCount += 1

          if (table === 'teams') {
            return Promise.resolve({ data: state.teams, error: null })
          }

          if (table === 'users' && filters.role === 'LEGAL_TEAM') {
            if (orderCallCount === 1) {
              return builder
            }

            return Promise.resolve({
              data: state.users.filter((user) => (user.role ?? '').toUpperCase() === 'LEGAL_TEAM'),
              error: null,
            })
          }

          return Promise.resolve({ data: [], error: null })
        },
      }

      return builder
    },
  }
}

jest.mock('@/lib/supabase/service', () => ({
  createServiceSupabase: () => createSupabaseMock(),
}))

import { supabaseTeamGovernanceRepository } from './supabase-team-governance-repository'

describe('supabaseTeamGovernanceRepository.listDepartments legal fallback', () => {
  beforeEach(() => {
    state = {
      teams: [
        {
          id: '38ee970a-579c-4801-af43-728b70bc114f',
          name: 'Legal and Compliance',
          is_active: true,
          poc_name: null,
          hod_name: 'Legal HOD',
        },
      ],
      roleMappings: [
        {
          team_id: '38ee970a-579c-4801-af43-728b70bc114f',
          email: 'legalhod@nxtwave.co.in',
          role_type: 'HOD',
        },
      ],
      legalAssignments: [],
      users: [],
    }
  })

  it('A: returns legal assignments when assignment rows exist', async () => {
    state.users = [
      {
        id: '0cea33cf-f077-498f-8dc8-c8b81b367a46',
        email: 'legal1@nxtwave.co.in',
        full_name: 'Legal 1',
        role: 'LEGAL_TEAM',
      },
    ]
    state.legalAssignments = [
      {
        department_id: '38ee970a-579c-4801-af43-728b70bc114f',
        user_id: '0cea33cf-f077-498f-8dc8-c8b81b367a46',
      },
    ]

    const departments = await supabaseTeamGovernanceRepository.listDepartments('00000000-0000-0000-0000-000000000000')

    expect(departments).toHaveLength(1)
    expect(departments[0].legalAssignments).toEqual([
      {
        userId: '0cea33cf-f077-498f-8dc8-c8b81b367a46',
        email: 'legal1@nxtwave.co.in',
        fullName: 'Legal 1',
      },
    ])
  })

  it('B: falls back to LEGAL_TEAM users when assignment rows are empty', async () => {
    state.users = [
      {
        id: '025ac0e0-77a8-4160-82b4-c1e7ae032b30',
        email: 'legalteam@nxtwave.co.in',
        full_name: 'Legal Team',
        role: 'LEGAL_TEAM',
      },
      {
        id: '829a0d46-e1aa-497a-8a59-8a355983654c',
        email: 'legalhod@nxtwave.co.in',
        full_name: 'Legal HOD',
        role: 'HOD',
      },
    ]

    const departments = await supabaseTeamGovernanceRepository.listDepartments('00000000-0000-0000-0000-000000000000')

    expect(departments).toHaveLength(1)
    expect(departments[0].legalAssignments).toEqual([
      {
        userId: '025ac0e0-77a8-4160-82b4-c1e7ae032b30',
        email: 'legalteam@nxtwave.co.in',
        fullName: 'Legal Team',
      },
    ])
  })

  it('C: deduplicates overlap between assignment rows and fallback users', async () => {
    state.users = [
      {
        id: '0cea33cf-f077-498f-8dc8-c8b81b367a46',
        email: 'legal1@nxtwave.co.in',
        full_name: 'Legal 1',
        role: 'LEGAL_TEAM',
      },
      {
        id: '025ac0e0-77a8-4160-82b4-c1e7ae032b30',
        email: 'legalteam@nxtwave.co.in',
        full_name: 'Legal Team',
        role: 'LEGAL_TEAM',
      },
    ]
    state.legalAssignments = [
      {
        department_id: '38ee970a-579c-4801-af43-728b70bc114f',
        user_id: '0cea33cf-f077-498f-8dc8-c8b81b367a46',
      },
    ]

    const departments = await supabaseTeamGovernanceRepository.listDepartments('00000000-0000-0000-0000-000000000000')

    expect(departments).toHaveLength(1)
    expect(departments[0].legalAssignments).toHaveLength(2)
    expect(departments[0].legalAssignments.map((assignment) => assignment.userId).sort()).toEqual([
      '025ac0e0-77a8-4160-82b4-c1e7ae032b30',
      '0cea33cf-f077-498f-8dc8-c8b81b367a46',
    ])
  })
})
