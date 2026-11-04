import { useIsMutating } from '@tanstack/react-query'
import { useState } from 'react'
import { SAVE_MUTATION_KEY } from '@/features/pages/queries'
import { usePendingSaves } from '@/lib/useDebouncedSave'

/** Indicateur discret de sauvegarde automatique (P5) : jamais de bouton « Enregistrer ». */
export function SaveIndicator() {
  const saving = useIsMutating({ mutationKey: SAVE_MUTATION_KEY }) + usePendingSaves((s) => s.count)
  const [hasSaved, setHasSaved] = useState(false)

  // Rien à signaler tant qu'aucune modification n'a été faite.
  if (saving > 0 && !hasSaved) setHasSaved(true)
  if (saving === 0 && !hasSaved) return null

  return (
    <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
      {saving > 0 ? 'Enregistrement…' : 'Enregistré'}
    </span>
  )
}
