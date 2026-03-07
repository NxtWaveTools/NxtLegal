import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Auto-generated type files from Supabase
    'src/types/database.ts',
    // Jest configuration (requires CommonJS)
    'jest.config.js',
    'jest.setup.js',
    // Playwright E2E tests (have their own tsconfig)
    'tests/e2e/**',
    // Vendored/minified worker assets
    'public/**/*.mjs',
  ]),
])

export default eslintConfig
