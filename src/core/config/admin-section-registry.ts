import {
  adminSectionDefinitions,
  defaultAdminSectionKey,
  type AdminSectionDefinition,
  type AdminSectionKey,
} from '@/core/constants/admin-sections'

const sectionMap = new Map<AdminSectionKey, AdminSectionDefinition>(
  adminSectionDefinitions.map((section) => [section.key, section])
)

const sectionPathMap = Object.fromEntries(
  adminSectionDefinitions.map((section) => [section.routeKey, `/admin/${section.key}`])
) as Record<AdminSectionDefinition['routeKey'], string>

export const adminSectionRegistry = {
  sections: adminSectionDefinitions,
  defaultSectionKey: defaultAdminSectionKey,
  defaultSectionPath: `/admin/${defaultAdminSectionKey}`,
  sectionPaths: sectionPathMap,
  isValidSectionKey(value: string): value is AdminSectionKey {
    return sectionMap.has(value as AdminSectionKey)
  },
  getSectionOrDefault(value?: string): AdminSectionDefinition {
    if (!value) {
      return sectionMap.get(defaultAdminSectionKey) as AdminSectionDefinition
    }

    return (
      sectionMap.get(value as AdminSectionKey) ?? (sectionMap.get(defaultAdminSectionKey) as AdminSectionDefinition)
    )
  },
} as const
