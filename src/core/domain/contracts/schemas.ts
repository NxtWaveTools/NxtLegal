import { z } from 'zod'
import { limits } from '@/core/constants/limits'

export const contractActionNames = [
  'hod.approve',
  'hod.bypass',
  'legal.approve',
  'legal.query',
  'legal.query.reroute',
  'approver.approve',
] as const

export const listContractsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(limits.paginationPageSize).default(20),
})

export const contractActionSchema = z
  .object({
    action: z.enum(contractActionNames),
    noteText: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, context) => {
    if ((value.action === 'legal.query.reroute' || value.action === 'hod.bypass') && !value.noteText?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['noteText'],
        message: 'Remarks are mandatory for this action',
      })
    }
  })

export const contractNoteSchema = z.object({
  noteText: z.string().trim().min(1, 'Note is required').max(2000, 'Note exceeds maximum length'),
})

export const contractApproverSchema = z.object({
  approverEmail: z.string().trim().toLowerCase().email('Valid approver email is required'),
})

export type ContractActionName = (typeof contractActionNames)[number]
