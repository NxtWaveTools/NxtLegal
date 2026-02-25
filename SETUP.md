# Environment Setup Guide

This guide covers setting up the development environment for NXT Legal CLM system.

## Prerequisites

- Node.js 18+ (v24.x recommended)
- npm or pnpm
- Supabase account with project created
- Git

## Initial Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd nxt_legal
npm install
```

### 2. Environment Variables

Create `.env.local` file in project root:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Authentication
JWT_SECRET_KEY=your-jwt-secret-min-32-chars-CHANGE-THIS-IN-PRODUCTION
AUTH_ALLOWED_DOMAINS=yourcompany.com

# Application
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NODE_ENV=development

# Features
FEATURE_MICROSOFT_OAUTH=true

# DocuSign Connect (Webhook HMAC Verification)
DOCUSIGN_CONNECT_KEY=your-docusign-connect-hmac-key
```

**⚠️ SECURITY WARNINGS:**
- **NEVER** commit `.env.local` to version control (it's in`.gitignore`)
- Change `JWT_SECRET_KEY` in production (min 32 characters)
- Use strong, randomly generated secrets
- Keep `SUPABASE_SERVICE_ROLE_KEY` private (full database access)

### 3. Database Setup

#### Option A: Using Supabase CLI (Recommended)

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
npx supabase link --project-ref your-project-ref

# Run all migrations
npx supabase db push
```

#### Option B: Manual Migration (Supabase Dashboard)

1. Go to Supabase Dashboard → SQL Editor
2. Run each migration file in order from `supabase/migrations/`:
   - `20260213053953_remote_schema.sql`
   - `20260213070000_create_employees_table.sql`
   - `20260214000000_create_tenants_table.sql`
   - `20260214000001_refactor_employees_table.sql`
   - `20260214000002_create_audit_logs_table.sql`
   - `20260214000003_create_idempotency_keys_table.sql`
   - `20260214000004_fix_audit_logs_user_id_type.sql`
   - `20260214000005_make_password_hash_nullable.sql`

### 4. Seed Test Data

Create test employee with default credentials:

```bash
npm run seed:test-employee
```

This creates:
- **Employee ID:** NW1007247
- **Password:** password
- **Tenant:** Default tenant (00000000-0000-0000-0000-000000000000)
- **Role:** viewer

### 5. Verify Setup

Run configuration validation:

```bash
npm run type-check  # Verify TypeScript compilation
npm run test:login  # Test employee login flow
```

Expected output:
```
✅ Employee found
✅ Password verified successfully
✅ Tenant isolation working correctly
✅ All login flow checks passed!
```

## Development Workflow

### Start Development Server

```bash
npm run dev
```

Server runs at: http://localhost:3000

### Testing Authentication

#### Employee Login (Password)

```bash
# Via test script
npm run test:login

# Via API (using curl or Postman)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "NW1007247",
    "password": "password"
  }'
```

#### Microsoft OAuth

1. Navigate to: http://localhost:3000/login
2. Click "Sign in with Microsoft"
3. Complete OAuth flow

**Note:** Microsoft OAuth requires:
- Azure AD app registration
- Callback URL configured in Supabase: `https://your-project.supabase.co/auth/v1/callback`
- `FEATURE_MICROSOFT_OAUTH=true` in `.env.local`

### Running Tests

```bash
# All tests
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# Coverage report
npm run test:coverage

# Integration tests only
npm test -- auth-service.integration.test

# Account lockout tests
npm test -- account-lockout-service.test
```

### Code Quality

```bash
# Lint and auto-fix
npm run lint

# Format code
npm run format

# Check formatting (CI)
npm run format:check

# Type check
npm run type-check
```

## Production Deployment

### Pre-Deployment Checklist

- [ ] Update `JWT_SECRET_KEY` (min 32 chars, cryptographically random)
- [ ] Set `NODE_ENV=production`
- [ ] Update `NEXT_PUBLIC_SITE_URL` to production URL
- [ ] Configure `AUTH_ALLOWED_DOMAINS` with company domains
- [ ] Verify all migrations applied to production database
- [ ] Test both login methods (employee + OAuth)
- [ ] Run full test suite: `npm run test:coverage`
- [ ] Verify configuration validation passes
- [ ] Check security headers in response
- [ ] Test account lockout mechanism
- [ ] Verify multi-tenant isolation

### Environment Variables (Production)

```env
# Production Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-prod-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=prod-anon-key
SUPABASE_SERVICE_ROLE_KEY=prod-service-role-key

JWT_SECRET_KEY=<GENERATE-NEW-RANDOM-32-CHAR-SECRET>
AUTH_ALLOWED_DOMAINS=yourcompany.com,subsidiary.com

NEXT_PUBLIC_SITE_URL=https://yourdomain.com
NODE_ENV=production

FEATURE_MICROSOFT_OAUTH=true

# DocuSign Connect (Webhook HMAC Verification)
DOCUSIGN_CONNECT_KEY=prod-docusign-connect-hmac-key
```

**Generate secure JWT secret:**
```bash
openssl rand -base64 48
```

### Deployment Steps (Vercel)

1. **Connect Repository**
   - Link GitHub/GitLab repo to Vercel
   - Configure environment variables in Vercel dashboard

2. **Build Settings**
   - Framework Preset: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`

3. **Environment Variables**
   - Add all production env vars in Vercel dashboard
   - Ensure `SUPABASE_SERVICE_ROLE_KEY` is marked as **sensitive**

4. **Deploy**
   ```bash
   git push origin main  # Auto-deploys via Vercel
   ```

5. **Post-Deployment Verification**
   - Test login endpoints
   - Check `/api/health` (if implemented)
   - Monitor logs for configuration validation success
   - Test rate limiting
   - Verify security headers

### Monitoring

Check logs for:
- `✅ Configuration validation passed` on startup
- Authentication success/failure rates
- Account lockout events
- Tenant isolation violations (should never occur)

## Troubleshooting

### "Configuration validation failed" on startup

**Cause:** Invalid or missing environment variables

**Fix:**
1. Check server logs for specific errors
2. Verify all required env vars are set
3. Validate JWT secret length (min 32 chars)
4. Ensure Supabase URL is HTTPS
5. Check domain format in `AUTH_ALLOWED_DOMAINS`

### "Employee not found" during login

**Cause:** Test employee not seeded or wrong tenant

**Fix:**
```bash
npm run seed:test-employee
npx supabase db reset  # If database is corrupted
```

### Microsoft OAuth fails with "Domain not allowed"

**Cause:** Email domain not in `AUTH_ALLOWED_DOMAINS`

**Fix:**
1. Add domain to `.env.local`: `AUTH_ALLOWED_DOMAINS=yourcompany.com,other.com`
2. Restart dev server
3. Check `src/core/domain/auth/policies/domain-policy.ts`

### Account locked after testing

**Cause:** 5 failed login attempts triggered lockout

**Fix:**
- Wait 15 minutes for automatic unlock
- Or manually unlock via database:
  ```sql
  -- Account lockout is in-memory only (no database state)
  -- Restart server to clear all lockouts
  ```

### TypeScript errors after git pull

**Cause:** Dependencies or types changed

**Fix:**
```bash
npm install  # Update dependencies
npm run type-check  # Verify compilation
```

### Tests failing with database errors

**Cause:** Migrations not applied or stale data

**Fix:**
```bash
npx supabase db reset  # Reset local database
npx supabase db push   # Reapply migrations
npm run seed:test-employee  # Recreate test data
npm test  # Re-run tests
```

## Helpful Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (http://localhost:3000) |
| `npm run build` | Production build |
| `npm start` | Run production build locally |
| `npm test` | Run all tests |
| `npm run test:login` | Test employee login flow |
| `npm run seed:test-employee` | Create test employee |
| `npm run type-check` | TypeScript validation |
| `npm run lint` | Code quality check |
| `npm run format` | Auto-format code |

## Support

For issues or questions:
1. Check [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
2. Review [.github/copilot-instructions.md](./.github/copilot-instructions.md) for development guidelines
3. Check Supabase dashboard logs for database errors
4. Review application logs for authentication errors

---

**Last Updated:** February 14, 2026  
**Version:** 2.0.0 (Production-Ready Hardened)
