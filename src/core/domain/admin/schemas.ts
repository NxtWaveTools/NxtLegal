import { z } from 'zod'
import { adminGovernance } from '@/core/constants/admin-governance'
import { isAllowedDomain } from '@/core/domain/auth/policies/domain-policy'

const roleOperationValues = [adminGovernance.operations.grant, adminGovernance.operations.revoke] as const

export const roleManagementRequestSchema = z.object({
  operation: z.enum(roleOperationValues),
  roleKey: z
    .string()
    .trim()
    .min(1, 'Role key is required')
    .max(64, 'Role key is too long')
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z_]+$/.test(value), {
      message: 'Role key must contain uppercase letters and underscores only',
    }),
  reason: z.string().trim().max(500, 'Reason is too long').optional(),
})

export const roleManagementPathSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
})

const teamOperationValues = ['rename', 'deactivate'] as const
const teamRoleTypeValues = ['POC', 'HOD'] as const
const departmentRoleTypeValues = adminGovernance.departmentRoleTypes
const userRoleTypeValues = adminGovernance.userRoleTypes

const corporateEmailSchema = z
  .string()
  .trim()
  .min(3, 'Email is required')
  .max(320, 'Email is too long')
  .email('Invalid email format')
  .transform((value) => value.toLowerCase())
  .refine((value) => isAllowedDomain(value), {
    message: 'Only approved Microsoft tenant domain emails are allowed',
  })

export const teamPathSchema = z.object({
  teamId: z.string().uuid('Invalid team ID'),
})

export const createDepartmentRequestSchema = z
  .object({
    name: z.string().trim().min(2, 'Department name is required').max(120, 'Department name is too long'),
    pocEmail: corporateEmailSchema,
    hodEmail: corporateEmailSchema,
    reason: z.string().trim().max(500, 'Reason is too long').optional(),
  })
  .superRefine((value, context) => {
    if (value.pocEmail === value.hodEmail) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'POC and HOD emails must be different',
        path: ['hodEmail'],
      })
    }
  })

export const updateDepartmentRequestSchema = z
  .object({
    operation: z.enum(teamOperationValues),
    name: z.string().trim().max(120, 'Department name is too long').optional(),
    reason: z.string().trim().max(500, 'Reason is too long').optional(),
  })
  .superRefine((value, context) => {
    if (value.operation === 'rename' && (!value.name || value.name.length < 2)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Department name is required for rename operation',
        path: ['name'],
      })
    }
  })

export const assignPrimaryRoleRequestSchema = z.object({
  roleType: z.enum(teamRoleTypeValues),
  newEmail: corporateEmailSchema,
  reason: z.string().trim().max(500, 'Reason is too long').optional(),
})

export const legalMatrixRequestSchema = z.object({
  legalUserIds: z.array(z.string().uuid('Invalid legal user ID')).max(100, 'Too many legal assignees').default([]),
  reason: z.string().trim().max(500, 'Reason is too long').optional(),
})

export const usersQuerySchema = z.object({
  groupBy: z.enum(['department']).optional(),
})

export const createUserRequestSchema = z.object({
  email: corporateEmailSchema,
  fullName: z.string().trim().min(2, 'Full name is required').max(160, 'Full name is too long').optional(),
  role: z.enum(userRoleTypeValues).default('LEGAL_TEAM'),
  isActive: z.boolean().optional().default(true),
})

export const userStatusPathSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
})

export const updateUserStatusRequestSchema = z.object({
  isActive: z.boolean(),
})

export const assignUserDepartmentRoleRequestSchema = z.object({
  departmentId: z.string().uuid('Invalid department ID'),
  departmentRole: z.enum(departmentRoleTypeValues),
})

export const systemConfigurationRequestSchema = z.object({
  featureFlags: z.object({
    enableAdminGovernance: z.boolean(),
    enableContractWorkflow: z.boolean(),
  }),
  securitySessionPolicies: z.object({
    accessTokenDays: z.number().int().min(1).max(30),
    refreshTokenDays: z.number().int().min(1).max(60),
    maxLoginAttempts: z.number().int().min(1).max(20),
  }),
  defaults: z.object({
    defaultDepartmentRole: z.enum(departmentRoleTypeValues),
    defaultUserRole: z.enum(userRoleTypeValues),
  }),
  reason: z.string().trim().max(500, 'Reason is too long').optional(),
})

export const auditViewerQuerySchema = z.object({
  action: z.string().trim().min(1).max(100).optional(),
  resourceType: z.string().trim().min(1).max(100).optional(),
  userId: z.string().trim().min(1).max(120).optional(),
  query: z.string().trim().min(1).max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(25),
})

export const auditViewerExportQuerySchema = auditViewerQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(5000).optional().default(1000),
})

export type RoleManagementRequest = z.infer<typeof roleManagementRequestSchema>
export type CreateDepartmentRequest = z.infer<typeof createDepartmentRequestSchema>
export type UpdateDepartmentRequest = z.infer<typeof updateDepartmentRequestSchema>
export type AssignPrimaryRoleRequest = z.infer<typeof assignPrimaryRoleRequestSchema>
export type LegalMatrixRequest = z.infer<typeof legalMatrixRequestSchema>
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>
export type UpdateUserStatusRequest = z.infer<typeof updateUserStatusRequestSchema>
export type AssignUserDepartmentRoleRequest = z.infer<typeof assignUserDepartmentRoleRequestSchema>
export type SystemConfigurationRequest = z.infer<typeof systemConfigurationRequestSchema>
export type AuditViewerQueryRequest = z.infer<typeof auditViewerQuerySchema>
