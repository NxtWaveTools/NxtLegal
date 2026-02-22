import { z } from 'zod'
import { adminGovernance } from '@/core/constants/admin-governance'

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

export const teamPathSchema = z.object({
  teamId: z.string().uuid('Invalid team ID'),
})

export const createDepartmentRequestSchema = z.object({
  name: z.string().trim().min(2, 'Department name is required').max(120, 'Department name is too long'),
  reason: z.string().trim().max(500, 'Reason is too long').optional(),
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
  userId: z.string().uuid('Invalid user ID'),
  reason: z.string().trim().max(500, 'Reason is too long').optional(),
})

export const legalMatrixRequestSchema = z.object({
  legalUserIds: z.array(z.string().uuid('Invalid legal user ID')).max(100, 'Too many legal assignees').default([]),
  reason: z.string().trim().max(500, 'Reason is too long').optional(),
})

export type RoleManagementRequest = z.infer<typeof roleManagementRequestSchema>
export type CreateDepartmentRequest = z.infer<typeof createDepartmentRequestSchema>
export type UpdateDepartmentRequest = z.infer<typeof updateDepartmentRequestSchema>
export type AssignPrimaryRoleRequest = z.infer<typeof assignPrimaryRoleRequestSchema>
export type LegalMatrixRequest = z.infer<typeof legalMatrixRequestSchema>
