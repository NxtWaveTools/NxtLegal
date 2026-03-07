export default function DashboardContractsLoading() {
  return (
    <main style={{ padding: '1rem 1.25rem' }} aria-busy="true" aria-live="polite">
      <div style={{ height: 18, width: 220, borderRadius: 6, background: 'var(--border)' }} />
      <div style={{ height: 14, width: 280, borderRadius: 6, background: 'var(--border)', marginTop: 10 }} />
      <div style={{ height: 340, borderRadius: 12, background: 'var(--border)', marginTop: 18 }} />
    </main>
  )
}
