export type EmployeeRecord = {
  id: string
  employeeId: string
  tenantId: string
  email: string
  fullName?: string | null
  teamId?: string | null
  teamName?: string | null
  isActive: boolean
  passwordHash?: string | null
  role: string
  tokenVersion: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type EmployeeLookup = {
  employeeId: string
  tenantId: string
}

export type EmployeeByEmail = {
  email: string
  tenantId: string
}

export interface EmployeeRepository {
  findByEmployeeId: (lookup: EmployeeLookup) => Promise<EmployeeRecord | null>
  findByEmail: (lookup: EmployeeByEmail) => Promise<EmployeeRecord | null>
  create: (employee: Omit<EmployeeRecord, 'createdAt' | 'updatedAt' | 'deletedAt'>) => Promise<EmployeeRecord>
  softDelete: (id: string, tenantId: string) => Promise<void>
  restore: (id: string, tenantId: string) => Promise<void>
  listByTenant: (tenantId: string, filters?: EmployeeFilters) => Promise<EmployeeRecord[]>
}

export type EmployeeFilters = {
  role?: string
  isActive?: boolean
}
