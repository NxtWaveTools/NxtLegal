export const roleRegistry = {
  user: 'USER',
  poc: 'POC',
  hod: 'HOD',
  legalTeam: 'LEGAL_TEAM',
  admin: 'ADMIN',
  legalAdmin: 'LEGAL_ADMIN',
  superAdmin: 'SUPER_ADMIN',
  system: 'SYSTEM',
} as const

export type RoleKey = keyof typeof roleRegistry
export type RoleName = (typeof roleRegistry)[RoleKey]
