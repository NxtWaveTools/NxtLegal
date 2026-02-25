// jest.setup.js - Jest configuration and global test setup

require('@testing-library/jest-dom')

// Mock Supabase client for tests
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: {}, error: null }),
      upsert: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
    })),
    auth: {
      signOut: jest.fn().mockResolvedValue({}),
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      exchangeCodeForSession: jest.fn().mockResolvedValue({ data: { session: {} } }),
    },
  })),
}))

// Mock next/headers
jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}))

// Suppress console logs in tests (optional)
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
}
