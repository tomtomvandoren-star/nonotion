import { Eye, EyeOff, Link2, Pin, PinOff, UserRoundCheck, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { usePeopleSearch } from '@/features/scheduling/queries'
import type { Person } from '@/lib/api/scheduling'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'
import { type Overlay, PERSON_DRAG_TYPE } from './overlays'

const iconButton =
  'flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent touch:size-10'

/**
 * « Planifier » (spec 6.17), sous « Mes agendas » : voir les disponibilités d'une personne (celles
 * qui l'ont permis, en blocs « Occupé »), les liens de planification (icône lien, S), et qui peut
 * voir les miennes. L'œil masque ou affiche le contenu de la section.
 */
export function PlanSection({
  searchRef,
  overlays,
  onShow,
  onClose,
  onLinks,
  onShares,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>
  overlays: Overlay[]
  onShow: (person: Person) => void
  onClose: (person: Person) => void
  onLinks: () => void
  onShares: () => void
}) {
  const hidden = useUi((s) => s.planHidden)
  const setHidden = useUi((s) => s.setPlanHidden)
  const pinned = useUi((s) => s.pinnedPeople)
  const setPinned = useUi((s) => s.setPinnedPeople)
  const togglePin = (overlay: Overlay) =>
    setPinned(
      overlay.pinned
        ? pinned.filter((person) => person.id !== overlay.person.id)
        : [...pinned, overlay.person],
    )

  return (
    <section aria-label="Planifier" className="text-sm">
      <div className="flex items-center gap-0.5 pb-1">
        <h2 className="flex-1 px-1 text-xs font-medium text-muted-foreground">Planifier</h2>
        <button
          type="button"
          aria-label="Liens de planification"
          title="Liens de planification (S)"
          onClick={onLinks}
          className={iconButton}
        >
          <Link2 aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          aria-label={hidden ? 'Afficher Planifier' : 'Masquer Planifier'}
          aria-pressed={hidden}
          title={hidden ? 'Afficher' : 'Masquer'}
          onClick={() => setHidden(!hidden)}
          className={iconButton}
        >
          {hidden ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
      </div>
      {!hidden && (
        <div className="grid gap-1">
          <PersonSearch inputRef={searchRef} onPick={onShow} />
          {overlays.length > 0 && (
            <ul aria-label="Disponibilités affichées" className="grid gap-0.5">
              {overlays.map((overlay) => (
                <li
                  key={overlay.person.id}
                  aria-label={overlay.person.name}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(PERSON_DRAG_TYPE, JSON.stringify(overlay.person))
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  title="Glissez sur la grille pour créer un rendez-vous"
                  className="group/person flex cursor-grab items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-accent/50"
                >
                  <span
                    aria-hidden
                    data-color={overlay.color}
                    className="nn-tint size-2.5 shrink-0 rounded-full"
                  />
                  <span className="min-w-0 flex-1 truncate" title={overlay.person.email}>
                    {overlay.person.name}
                  </span>
                  <button
                    type="button"
                    aria-label={
                      overlay.pinned
                        ? `Détacher ${overlay.person.name}`
                        : `Épingler ${overlay.person.name}`
                    }
                    aria-pressed={overlay.pinned}
                    onClick={() => togglePin(overlay)}
                    className={cn(
                      iconButton,
                      !overlay.pinned &&
                        'opacity-0 group-hover/person:opacity-100 focus-visible:opacity-100 touch:opacity-100',
                    )}
                  >
                    {overlay.pinned ? (
                      <PinOff aria-hidden className="size-3.5" />
                    ) : (
                      <Pin aria-hidden className="size-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Fermer les disponibilités de ${overlay.person.name}`}
                    onClick={() => {
                      if (overlay.pinned) togglePin(overlay)
                      onClose(overlay.person)
                    }}
                    className={iconButton}
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={onShares}
            className="flex h-8 w-full items-center gap-1.5 rounded-sm px-1 text-left text-muted-foreground hover:bg-accent touch:h-10"
          >
            <UserRoundCheck aria-hidden className="size-4" /> Qui peut voir mes disponibilités
          </button>
        </div>
      )}
    </section>
  )
}

/** « Entrez le nom d'une personne… » : une liste de suggestions, au clavier comme à la souris. */
function PersonSearch({
  inputRef,
  onPick,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  onPick: (person: Person) => void
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const listId = useId()
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 200)
    return () => clearTimeout(timer)
  }, [query])
  const search = usePeopleSearch(debounced)
  const people = debounced.trim() ? (search.data ?? []) : []
  const expanded = open && query.trim() !== '' && !search.isPending
  const pick = (person: Person) => {
    onPick(person)
    setQuery('')
    setDebounced('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        role="combobox"
        aria-label="Voir les disponibilités d’une personne"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && people[active] ? `${listId}-${active}` : undefined}
        placeholder="Entrez le nom d’une personne…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((i) => Math.min(i + 1, Math.max(people.length - 1, 0)))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (event.key === 'Enter' && people[active]) {
            event.preventDefault()
            pick(people[active])
          } else if (event.key === 'Escape' && query) {
            // Vider le champ d'abord ; un second Échap ferme la superposition.
            event.preventDefault()
            setQuery('')
            setDebounced('')
          }
        }}
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:border-primary touch:h-10"
      />
      {expanded && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Personnes"
          className="absolute inset-x-0 top-full z-30 mt-1 grid gap-0.5 rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {people.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">
              Personne. Seules les personnes qui vous ont permis de voir leurs disponibilités
              apparaissent ici.
            </li>
          ) : (
            people.map((person, i) => (
              <li
                key={person.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(person)}
                className={cn(
                  'grid cursor-pointer rounded-sm px-2 py-1',
                  i === active && 'bg-accent',
                )}
              >
                <span className="truncate">{person.name}</span>
                <span className="truncate text-xs text-muted-foreground">{person.email}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
