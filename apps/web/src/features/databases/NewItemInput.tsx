import { Plus } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useCreateRow } from './queries'

export type NewItemProps = {
  databaseId: string
  open: boolean
  onOpen: () => void
  onClose: () => void
  /** Les valeurs héritées de la vue (filtre actif, section). */
  values: () => Record<string, unknown>
  className?: string
}

/**
 * « + Nouveau » à la suite des éléments (spec 6.6) : cliquer ouvre une ligne, le curseur dans le
 * Titre. Entrée crée l'élément et rouvre une ligne vide : on peut en saisir plusieurs d'affilée sans
 * lâcher le clavier. Le champ reste le même pendant que le serveur répond : aucune lettre ne se perd.
 */
export function NewItemInput({
  databaseId,
  open,
  onOpen,
  onClose,
  values,
  className,
}: NewItemProps) {
  const createRow = useCreateRow(databaseId)
  const [title, setTitle] = useState('')

  const submit = () => {
    const text = title
    setTitle('')
    createRow.mutate({ title: text, properties: values() })
  }

  if (!open)
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex h-8 w-full items-center gap-1.5 px-2 text-sm text-muted-foreground hover:bg-accent',
          className,
        )}
      >
        <Plus aria-hidden className="size-4" /> Nouveau
      </button>
    )

  return (
    <div className={cn('flex h-8 items-center gap-1.5 px-2', className)}>
      <Plus aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <input
        autoFocus
        aria-label="Titre du nouvel élément"
        placeholder="Titre, puis Entrée"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter') {
            event.preventDefault()
            submit()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            if (title.trim() !== '') submit()
            onClose()
          }
        }}
        onBlur={() => {
          if (title.trim() !== '') submit()
          onClose()
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/60 focus-visible:outline-none"
      />
    </div>
  )
}
