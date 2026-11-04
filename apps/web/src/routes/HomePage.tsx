import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { fetchHealth } from '../lib/api/health'

const dateFormat = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'medium', timeStyle: 'short' })

/** Page « Bonjour » de la phase 0 : prouve que le front, l'API, la base et le cron répondent. */
export function HomePage() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false })

  const apiStatus = health.isPending ? 'Vérification…' : health.isSuccess ? 'OK' : 'Injoignable'
  const cronStatus = !health.isSuccess
    ? '—'
    : health.data.cron_last_run_at
      ? `Dernier passage : ${dateFormat.format(new Date(health.data.cron_last_run_at))}`
      : 'Pas encore exécuté'

  return (
    <main className="mx-auto flex min-h-dvh max-w-[700px] flex-col justify-center px-4 py-12">
      <h1 className="text-[40px] leading-tight font-bold">Bonjour</h1>
      <p className="mt-2 text-fg-muted">
        Nonotion : un espace où tout est un bloc, une page ou une base.
      </p>

      <dl className="mt-10 divide-y divide-line border-y border-line text-sm" aria-live="polite">
        <StatusRow label="API et base de données" value={apiStatus} ok={health.isSuccess} />
        <StatusRow
          label="Planificateur (cron)"
          value={cronStatus}
          ok={Boolean(health.data?.cron_last_run_at)}
        />
      </dl>
    </main>
  )
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  const labelId = useId()

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt id={labelId} className="text-fg-muted">
        {label}
      </dt>
      <dd aria-labelledby={labelId} className={`m-0 font-medium ${ok ? 'text-accent' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
