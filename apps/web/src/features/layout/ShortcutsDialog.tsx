import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { modKeyLabel, shortcutLabel } from '@/lib/shortcuts'
import { useUi } from '@/stores/ui'

const shift = 'Maj'

/** Les raccourcis (spec 6.14), par endroit. Ctrl devient ⌘ sur macOS (décidé dans lib/shortcuts). */
const GROUPS: { title: string; items: [keys: string, label: string][] }[] = [
  {
    title: 'Partout',
    items: [
      [shortcutLabel('k'), 'Rechercher une page'],
      [shortcutLabel('n'), 'Nouvelle page'],
      [shortcutLabel('\\'), 'Afficher ou masquer la barre latérale'],
      [shortcutLabel('/'), 'Cette aide'],
    ],
  },
  {
    title: 'Dans une page',
    items: [
      ['/', 'Menu des blocs'],
      [`${modKeyLabel}+Z`, 'Annuler'],
      [`${modKeyLabel}+${shift}+Z`, 'Rétablir'],
      ['Tab', 'Indenter le bloc'],
      [`${shift}+Tab`, 'Désindenter le bloc'],
      ['Échap', 'Sélectionner le bloc'],
      ['# ␣', 'Titre 1 (## et ### : titres 2 et 3)'],
      ['- ␣  ou  1. ␣', 'Liste à puces, liste numérotée'],
      ['[] ␣', 'Case à cocher'],
      ['> ␣', 'Liste dépliable'],
      ['---', 'Séparateur'],
    ],
  },
  {
    title: 'Dans un calendrier',
    items: [
      ['D', 'Jour'],
      ['W', 'Semaine'],
      ['M', 'Mois'],
      ['T', 'Aujourd’hui'],
    ],
  },
]

/**
 * L'aide des raccourcis (Ctrl+/, spec 6.14). Sur téléphone il n'y a pas de raccourcis : chaque
 * action a son bouton ; l'aide reste ouvrable depuis le menu de l'espace de travail.
 */
export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen)
  const setOpen = useUi((s) => s.setShortcutsOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogTitle>Raccourcis clavier</DialogTitle>
        <DialogDescription className="sr-only">
          Les raccourcis de Nonotion, regroupés par endroit.
        </DialogDescription>
        {GROUPS.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">{group.title}</h3>
            <dl className="grid gap-0.5">
              {group.items.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between gap-3 py-0.5">
                  <dt className="text-sm">{label}</dt>
                  <dd>
                    <kbd className="rounded-sm border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-xs whitespace-nowrap">
                      {keys}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  )
}
