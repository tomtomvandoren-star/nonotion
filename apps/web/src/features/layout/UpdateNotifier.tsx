import { useEffect } from 'react'
import { toast } from 'sonner'
import { flushPendingSaves } from '@/features/databases/queries'
import { writesSettled } from '@/lib/api/client'
import { type AppUpdate, platform } from '@/platform'

/** Une fois au démarrage, puis toutes les 6 heures pour qui laisse l'application ouverte. */
const FIRST_CHECK_MS = 5_000
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

/** Avant le redémarrage : ce qui n'est pas encore enregistré part, et l'on attend qu'il arrive. */
async function saveEverything() {
  // Quitter le champ envoie le texte en attente (titre, contenu de la page).
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  flushPendingSaves()
  await writesSettled()
}

async function install(update: AppUpdate) {
  const id = toast.loading(`Téléchargement de Nonotion ${update.version}…`, {
    duration: Infinity,
  })
  try {
    await update.install(async () => {
      toast.loading('Installation, puis redémarrage…', { id, duration: Infinity })
      await saveEverything()
    })
  } catch {
    toast.error('La mise à jour n’a pas pu être installée. Nouvel essai au prochain démarrage.', {
      id,
      duration: 8_000,
    })
  }
}

/**
 * Application pour ordinateur : propose la nouvelle version quand elle est publiée. Rien ne
 * s'installe sans l'accord de l'utilisateur ; sur le web, il n'y a jamais rien à proposer.
 */
export function UpdateNotifier() {
  useEffect(() => {
    if (platform.kind === 'web') return
    let offered: string | null = null
    const look = async () => {
      const update = await platform.checkForUpdate().catch(() => null)
      if (!update || update.version === offered) return
      offered = update.version
      toast(`Nonotion ${update.version} est disponible`, {
        description: 'L’application redémarre une fois la mise à jour installée.',
        duration: Infinity,
        action: { label: 'Installer', onClick: () => void install(update) },
      })
    }
    const first = setTimeout(look, FIRST_CHECK_MS)
    const every = setInterval(look, CHECK_EVERY_MS)
    return () => {
      clearTimeout(first)
      clearInterval(every)
    }
  }, [])
  return null
}
