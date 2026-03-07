export default function RepositoryLoading() {
  return (
    <main style={{ padding: '1rem 1.25rem' }} aria-busy="true" aria-live="polite">
      <div style={{ height: 18, width: 180, borderRadius: 6, background: 'var(--border)' }} />
      <div style={{ height: 14, width: 260, borderRadius: 6, background: 'var(--border)', marginTop: 10 }} />
      <div style={{ height: 320, borderRadius: 12, background: 'var(--border)', marginTop: 18 }} />
    </main>
  )
}
