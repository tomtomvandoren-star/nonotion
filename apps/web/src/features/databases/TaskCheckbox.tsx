import type { DatabaseRowData } from '@nonotion/shared'
import { useState } from 'react'
import { displayTitle } from '@/features/pages/displayTitle'
import { cn } from '@/lib/utils'
import type { Completion } from './completion'

/** Le geste le plus fréquent d'une liste de tâches coûte un clic, pas l'ouverture d'un menu. */
export function TaskCheckbox({
  row,
  completion,
  className,
}: {
  row: DatabaseRowData
  completion: Completion
  className?: string
}) {
  const done = completion.isDone(row)
  // Le clic se voit tout de suite, avant même que la base en cache suive ; dès que l'état réel
  // change (ou revient en arrière après une erreur), c'est lui qui s'affiche.
  const [pending, setPending] = useState<boolean | null>(null)
  const [seen, setSeen] = useState(done)
  if (seen !== done) {
    setSeen(done)
    setPending(null)
  }
  return (
    <input
      type="checkbox"
      aria-label={`Terminé : ${displayTitle(row.title)}`}
      checked={pending ?? done}
      onChange={() => {
        setPending(!done)
        completion.toggle(row)
      }}
      className={cn('nn-task-check size-4 shrink-0 accent-[var(--accent)]', className)}
    />
  )
}
