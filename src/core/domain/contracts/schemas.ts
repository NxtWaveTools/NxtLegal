import { z } from 'zod'
import { limits } from '@/core/constants/limits'
import {
  contractRepositoryExportColumns,
  contractRepositoryExportFormats,
  contractRepositoryStatuses,
  contractStatuses,
} from '@/core/constants/contracts'

export const contractActionNames = [
  'hod.approve',
  'hod.reject',
  'hod.bypass',
  'legal.set.under_review',
  'legal.set.pending_internal',
  'legal.set.pending_external',
  'legal.set.offline_execution',
  'legal.set.on_hold',
  'legal.set.completed',
  'legal.void',
  'legal.approve',
  'legal.reject',
  'legal.query',
  'legal.query.reroute',
  'approver.approve',
  'approver.reject',
] as const

export const listContractsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(limits.paginationPageSize).default(20),
})

export const dashboardContractsFilterValues = [
  'ALL',
  'HOD_PENDING',
  'UNDER_REVIEW',
  'COMPLETED',
  'ON_HOLD',
  'ASSIGNED_TO_ME',
] as const

export const dashboardContractsQuerySchema = z.object({
  filter: z.enum(dashboardContractsFilterValues),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(limits.paginationPageSize).default(limits.dashboardContractsPageSize),
  includeExtras: z.coerce.boolean().optional().default(false),
})

export const additionalApproverHistoryQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(limits.dashboardContractsPageSize)
    .default(limits.dashboardContractsPageSize),
  departmentId: z.string().uuid().optional(),
})

export const pendingApprovalsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(limits.paginationPageSize).default(20),
})

export const failedContractNotificationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(limits.paginationPageSize).default(20),
  contractId: z.string().uuid().optional(),
})

export const repositorySortByValues = ['title', 'created_at', 'hod_approved_at', 'status', 'tat_deadline_at'] as const
export const repositorySortDirectionValues = ['asc', 'desc'] as const
export const repositoryDateBasisValues = ['request_created_at', 'hod_approved_at'] as const
export const repositoryDatePresetValues = ['week', 'month', 'multiple_months', 'quarter', 'year', 'custom'] as const

export const repositoryContractsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(limits.paginationPageSize).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.nativeEnum(contractStatuses).optional(),
  repositoryStatus: z.nativeEnum(contractRepositoryStatuses).optional(),
  sortBy: z.enum(repositorySortByValues).default('created_at'),
  sortDirection: z.enum(repositorySortDirectionValues).default('desc'),
  dateBasis: z.enum(repositoryDateBasisValues).optional(),
  datePreset: z.enum(repositoryDatePresetValues).optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
})

const repositoryExportColumnValues = Object.values(contractRepositoryExportColumns) as [
  (typeof contractRepositoryExportColumns)[keyof typeof contractRepositoryExportColumns],
  ...(typeof contractRepositoryExportColumns)[keyof typeof contractRepositoryExportColumns][],
]

const repositoryExportFormatValues = Object.values(contractRepositoryExportFormats) as [
  (typeof contractRepositoryExportFormats)[keyof typeof contractRepositoryExportFormats],
  ...(typeof contractRepositoryExportFormats)[keyof typeof contractRepositoryExportFormats][],
]

export const repositoryReportingQuerySchema = repositoryContractsQuerySchema.omit({
  cursor: true,
  limit: true,
  sortBy: true,
  sortDirection: true,
})

export const repositoryExportQuerySchema = repositoryReportingQuerySchema.extend({
  format: z.enum(repositoryExportFormatValues).default(contractRepositoryExportFormats.csv),
  columns: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return [] as (typeof repositoryExportColumnValues)[number][]
      }

      const values = value
        .split(',')
        .map((column) => column.trim())
        .filter((column): column is (typeof repositoryExportColumnValues)[number] =>
          repositoryExportColumnValues.includes(column as (typeof repositoryExportColumnValues)[number])
        )

      return Array.from(new Set(values))
    }),
})

export const contractActionSchema = z
  .object({
    action: z.enum(contractActionNames),
    noteText: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, context) => {
    const isRemarkMandatoryAction =
      value.action === 'legal.query.reroute' ||
      value.action === 'hod.bypass' ||
      value.action === 'hod.reject' ||
      value.action === 'legal.void' ||
      value.action === 'legal.reject' ||
      value.action === 'approver.reject'

    if (isRemarkMandatoryAction && !value.noteText?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['noteText'],
        message: 'Remarks are mandatory for this action',
      })
    }
  })

export const bypassApprovalActionName = 'BYPASS_APPROVAL' as const

export const contractBypassApprovalSchema = z.object({
  action: z.literal(bypassApprovalActionName),
  approverId: z.string().trim().uuid('Valid approverId is required'),
  reason: z.string().trim().min(1, 'Bypass reason is required').max(2000, 'Bypass reason exceeds maximum length'),
})

export const contractActionCommandSchema = z.union([contractActionSchema, contractBypassApprovalSchema])

export const contractNoteSchema = z.object({
  noteText: z.string().trim().min(1, 'Note is required').max(2000, 'Note exceeds maximum length'),
})

export const contractActivityMessageSchema = z.object({
  messageText: z.string().trim().min(1, 'Message is required').max(2000, 'Message exceeds maximum length'),
})

export const contractActivityReadStateSchema = z.object({
  markSeen: z.literal(true).default(true),
})

export const contractApproverSchema = z.object({
  approverEmail: z.string().trim().toLowerCase().email('Valid approver email is required'),
})

export const contractApproverReminderSchema = z.object({
  approverEmail: z.string().trim().toLowerCase().email('Valid approver email is required').optional(),
})

export const contractLegalAssignmentSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('add_collaborator'),
    collaboratorEmail: z.string().trim().toLowerCase().email('Valid collaborator email is required'),
  }),
  z.object({
    operation: z.literal('remove_collaborator'),
    collaboratorEmail: z.string().trim().toLowerCase().email('Valid collaborator email is required'),
  }),
])

export const contractSignatoryFieldTypeValues = [
  'SIGNATURE',
  'INITIAL',
  'STAMP',
  'NAME',
  'DATE',
  'TIME',
  'TEXT',
] as const
export const contractSignatoryRecipientTypeValues = ['INTERNAL', 'EXTERNAL'] as const

const contractSignatoryFieldSchema = z
  .object({
    field_type: z.enum(contractSignatoryFieldTypeValues),
    page_number: z.number().int().min(1).optional(),
    x_position: z.number().min(0).optional(),
    y_position: z.number().min(0).optional(),
    anchor_string: z.string().trim().min(1).optional(),
    assigned_signer_email: z.string().trim().toLowerCase().email('Valid signer email is required'),
  })
  .superRefine((value, context) => {
    if (value.anchor_string) {
      return
    }

    const hasCoordinates =
      typeof value.page_number === 'number' &&
      typeof value.x_position === 'number' &&
      typeof value.y_position === 'number'

    if (!hasCoordinates) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anchor_string'],
        message: 'Each field must define anchor_string or page_number + x_position + y_position',
      })
    }
  })

const contractSignatoryRecipientSchema = z.object({
  signatoryEmail: z.string().trim().toLowerCase().email('Valid signatory email is required'),
  recipientType: z.enum(contractSignatoryRecipientTypeValues),
  routingOrder: z.number().int().min(1),
  fields: z.array(contractSignatoryFieldSchema).default([]),
})

const contractSigningPreparationRecipientSchema = z.object({
  name: z.string().trim().min(1, 'Recipient name is required'),
  email: z.string().trim().toLowerCase().email('Valid recipient email is required'),
  recipient_type: z.enum(contractSignatoryRecipientTypeValues),
  routing_order: z.number().int().min(1),
})

const contractSigningPreparationFieldSchema = z
  .object({
    field_type: z.enum(contractSignatoryFieldTypeValues),
    page_number: z.number().int().min(1).optional(),
    x_position: z.number().min(0).optional(),
    y_position: z.number().min(0).optional(),
    anchor_string: z.string().trim().min(1).optional(),
    assigned_signer_email: z.string().trim().toLowerCase().email('Valid signer email is required'),
  })
  .superRefine((value, context) => {
    if (value.anchor_string) {
      return
    }

    const hasCoordinates =
      typeof value.page_number === 'number' &&
      typeof value.x_position === 'number' &&
      typeof value.y_position === 'number'

    if (!hasCoordinates) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anchor_string'],
        message: 'Each field must define anchor_string or page_number + x_position + y_position',
      })
    }
  })

export const contractSigningPreparationDraftSchema = z
  .object({
    recipients: z.array(contractSigningPreparationRecipientSchema).min(1, 'At least one recipient is required'),
    fields: z.array(contractSigningPreparationFieldSchema).default([]),
  })
  .superRefine((value, context) => {
    const recipientEmails = new Set(value.recipients.map((recipient) => recipient.email))

    value.fields.forEach((field, fieldIndex) => {
      if (!recipientEmails.has(field.assigned_signer_email)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fields', fieldIndex, 'assigned_signer_email'],
          message: 'assigned_signer_email must match one of the provided recipients',
        })
      }
    })
  })

export const contractSignatorySchema = z
  .object({
    recipients: z.array(contractSignatoryRecipientSchema).min(1, 'At least one signatory recipient is required'),
  })
  .superRefine((value, context) => {
    const recipientEmails = new Set(value.recipients.map((recipient) => recipient.signatoryEmail))

    value.recipients.forEach((recipient, recipientIndex) => {
      recipient.fields.forEach((field, fieldIndex) => {
        if (!recipientEmails.has(field.assigned_signer_email)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['recipients', recipientIndex, 'fields', fieldIndex, 'assigned_signer_email'],
            message: 'assigned_signer_email must match one of the provided recipients',
          })
        }
      })
    })
  })

export const docusignWebhookSchema = z.object({
  envelopeId: z.string().trim().min(1, 'Envelope ID is required'),
  recipientEmail: z.string().trim().toLowerCase().email('Valid recipient email is required').optional(),
  status: z.string().trim().min(1, 'Status is required'),
  signedAt: z.string().datetime().optional(),
  eventId: z.string().trim().min(1).optional(),
  signerIp: z.string().trim().min(1).optional(),
})

export type ContractActionName = (typeof contractActionNames)[number]
export type ContractBypassApprovalActionName = typeof bypassApprovalActionName
export type ContractBypassApprovalPayload = z.infer<typeof contractBypassApprovalSchema>
export type ContractActionCommandPayload = z.infer<typeof contractActionCommandSchema>
export type DashboardContractsFilter = (typeof dashboardContractsFilterValues)[number]
export type ContractLegalAssignmentOperation = z.infer<typeof contractLegalAssignmentSchema>['operation']
export type ContractSignatoryPayload = z.infer<typeof contractSignatorySchema>
export type ContractSigningPreparationDraftPayload = z.infer<typeof contractSigningPreparationDraftSchema>
