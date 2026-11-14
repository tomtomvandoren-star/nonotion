import { useIsMutating } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { SAVE_MUTATION_KEY } from '@/features/pages/queries'
import { useNetwork } from '@/lib/offline/network'
import { useOutbox } from '@/lib/offline/outbox'
import { usePendingSaves } from '@/lib/useDebouncedSave'
import { platform } from '@/platform'

/** Indicateur discret de sauvegarde automatique (P5) : jamais de bouton « Enregistrer ». */
export function SaveIndicator() {
  return platform.offline ? <OfflineIndicator /> : <SavedIndicator />
}

/**
 * Applications natives (spec 6.16) : hors ligne et ce qui attend, la synchronisation au retour de
 * la connexion, et les conflits à résoudre (un clic mène à la page).
 */
function OfflineIndicator() {
  const online = useNetwork((state) => state.online)
  const queued = useOutbox((state) => state.entries.length)
  const syncing = useOutbox((state) => state.syncing)
  const conflict = useOutbox((state) => Object.values(state.conflicts)[0])
  const conflicts = useOutbox((state) => Object.keys(state.conflicts).length)
  const navigate = useNavigate()

  if (conflict)
    return (
      <button
        type="button"
        onClick={() => void navigate({ to: '/p/$pageId', params: { pageId: conflict.pageId } })}
        className="rounded-sm px-1.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-accent dark:text-amber-400"
      >
        {conflicts} conflit{conflicts > 1 ? 's' : ''} à résoudre
      </button>
    )
  if (!online)
    return (
      <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
        Hors ligne
        {queued > 0 && ` · ${queued} modification${queued > 1 ? 's' : ''} en attente`}
      </span>
    )
  if (syncing || queued > 0)
    return (
      <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
        Synchronisation…
      </span>
    )
  return <SavedIndicator />
}

/** Une modification a déjà été faite (l'indicateur peut être remonté entre-temps : hors ligne…). */
let seenSave = false

function SavedIndicator() {
  const saving = useIsMutating({ mutationKey: SAVE_MUTATION_KEY }) + usePendingSaves((s) => s.count)
  const queued = useOutbox((state) => state.entries.length)
  const [hasSaved, setHasSaved] = useState(seenSave || queued > 0)
  useEffect(() => {
    if (saving > 0) seenSave = true
  }, [saving])

  // Rien à signaler tant qu'aucune modification n'a été faite.
  if (saving > 0 && !hasSaved) setHasSaved(true)
  if (saving === 0 && !hasSaved) return null

  return (
    <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
      {saving > 0 ? 'Enregistrement…' : 'Enregistré'}
    </span>
  )
}
