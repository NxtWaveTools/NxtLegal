'use client'

import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import LogoutButton from '@/components/auth/LogoutButton'
import ThemeToggle from '@/components/theme/ThemeToggle'
import { routeRegistry } from '@/core/config/route-registry'
import styles from './dashboard.module.css'

type ProtectedAppShellProps = {
  session: {
    fullName?: string | null
    role?: string | null
  }
  activeNav: 'home' | 'repository' | 'admin'
  children: ReactNode
}

export default function ProtectedAppShell({ session, activeNav, children }: ProtectedAppShellProps) {
  const router = useRouter()
  const canAccessAdminConsole = ['ADMIN', 'LEGAL_ADMIN', 'SUPER_ADMIN'].includes((session.role ?? '').toUpperCase())

  const displayName = useMemo(() => {
    if (!session.fullName) {
      return 'there'
    }

    return session.fullName.split(' ')[0] || session.fullName
  }, [session.fullName])

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand} aria-label="NxtWave logo" role="img">
          <div className={styles.sidebarLogo}>
            <svg viewBox="0 0 24 24" className={styles.sidebarLogoSvg} aria-hidden="true" focusable="false">
              <path d="M4 17V7h2.5l4 5.2V7H13v10h-2.4L6.6 11.8V17H4Z" fill="currentColor" />
              <path
                d="M15 7h2.3l1.7 2.5L20.7 7H23l-2.9 4.2L23 15h-2.3l-1.7-2.5-1.7 2.5H15l2.9-3.8L15 7Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <span className={styles.sidebarBrandText}>NxtWave</span>
        </div>
        <div className={styles.navList}>
          <button
            type="button"
            className={`${styles.navItem} ${activeNav === 'home' ? styles.navItemActive : ''}`}
            aria-label="Home"
            onClick={() => router.push(routeRegistry.protected.dashboard)}
          >
            <span className={styles.navIcon}>
              <svg viewBox="0 0 20 20" className={styles.navIconSvg} aria-hidden="true" focusable="false">
                <path d="M3 9.5 10 4l7 5.5V17a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1V9.5Z" fill="currentColor" />
              </svg>
            </span>
          </button>
          <button
            type="button"
            className={`${styles.navItem} ${activeNav === 'repository' ? styles.navItemActive : ''}`}
            aria-label="Repository"
            onClick={() => router.push(routeRegistry.protected.repository)}
          >
            <span className={styles.navIcon}>
              <svg viewBox="0 0 20 20" className={styles.navIconSvg} aria-hidden="true" focusable="false">
                <rect x="3" y="3.5" width="14" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path d="M6 7.5h8M6 10h8M6 12.5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
          </button>
          {canAccessAdminConsole ? (
            <button
              type="button"
              className={`${styles.navItem} ${activeNav === 'admin' ? styles.navItemActive : ''}`}
              aria-label="Admin Console"
              onClick={() => router.push(routeRegistry.protected.adminConsole)}
            >
              <span className={styles.navIcon}>
                <svg viewBox="0 0 20 20" className={styles.navIconSvg} aria-hidden="true" focusable="false">
                  <rect x="4" y="4" width="5" height="5" rx="1.2" fill="currentColor" />
                  <rect x="11" y="4" width="5" height="5" rx="1.2" fill="currentColor" />
                  <rect x="4" y="11" width="5" height="5" rx="1.2" fill="currentColor" />
                  <rect x="11" y="11" width="5" height="5" rx="1.2" fill="currentColor" />
                </svg>
              </span>
            </button>
          ) : null}
          <button type="button" className={styles.navItem} aria-label="Analytics">
            <span className={styles.navIcon}>
              <svg viewBox="0 0 20 20" className={styles.navIconSvg} aria-hidden="true" focusable="false">
                <path d="M4 15.5h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <rect x="5" y="10" width="2.5" height="4.5" rx="0.7" fill="currentColor" />
                <rect x="8.8" y="7.5" width="2.5" height="7" rx="0.7" fill="currentColor" />
                <rect x="12.6" y="5" width="2.5" height="9.5" rx="0.7" fill="currentColor" />
              </svg>
            </span>
          </button>
        </div>
        <div className={styles.bottomNav}>
          <button type="button" className={styles.navItem} aria-label="Settings">
            <span className={styles.navIcon}>
              <svg viewBox="0 0 20 20" className={styles.navIconSvg} aria-hidden="true" focusable="false">
                <path
                  d="M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm7 3.5-1.5.6a5.9 5.9 0 0 1-.3 1l.9 1.3-1.6 1.6-1.3-.9a5.9 5.9 0 0 1-1 .3L11 17H9l-.6-1.5a5.9 5.9 0 0 1-1-.3l-1.3.9-1.6-1.6.9-1.3a5.9 5.9 0 0 1-.3-1L3 10l.6-2a5.9 5.9 0 0 1 .3-1L3 5.7l1.6-1.6 1.3.9a5.9 5.9 0 0 1 1-.3L9 3h2l.6 1.5a5.9 5.9 0 0 1 1 .3l1.3-.9L15.5 5.7l-.9 1.3a5.9 5.9 0 0 1 .3 1L17 10Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          <button type="button" className={styles.navItem} aria-label="Chat">
            <span className={styles.navIcon}>
              <svg viewBox="0 0 20 20" className={styles.navIconSvg} aria-hidden="true" focusable="false">
                <path
                  d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 14.5H9l-3.5 2v-2H4A1.5 1.5 0 0 1 2.5 13V6A1.5 1.5 0 0 1 4 4.5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        </div>
      </aside>

      <div className={styles.content}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <div className={styles.searchBar}>
              <span>Search</span>
              <input type="text" className={styles.searchInput} placeholder="Shortcuts" aria-label="Search shortcuts" />
              <span>Ctrl+K</span>
            </div>
          </div>
          <div className={styles.topbarRight}>
            <ThemeToggle />
            <span className={styles.companyBadge}>NxtWave Disruptive Technologies Private Limited</span>
            <div className={styles.profileBadge}>{displayName.slice(0, 1).toUpperCase()}</div>
            <LogoutButton />
          </div>
        </header>

        {children}
      </div>
    </div>
  )
}
