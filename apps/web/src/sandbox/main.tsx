import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import BlockEditor from '@/features/editor/BlockEditor'
import '../index.css'

/*
 * Bac à sable de l'éditeur : l'éditeur seul, sans compte ni serveur, rien n'est enregistré.
 * Il sert au test précoce des vues web natives (Capacitor sur Android, Tauri sur Linux) :
 * clavier, sélection, menu « / », poignée, barre de mise en forme (spec 9, fin de la phase 2).
 */

const text = (value: string) => [{ type: 'text', text: value, styles: {} }]

const SAMPLE = [
  { type: 'heading', props: { level: 1 }, content: text('Essai de l’éditeur') },
  {
    type: 'paragraph',
    content: text(
      'Écrivez ici, sélectionnez du texte pour voir la barre de mise en forme, tapez « / » en début de ligne pour le menu des blocs.',
    ),
  },
  { type: 'heading', props: { level: 2 }, content: text('À vérifier sur l’appareil') },
  { type: 'checkListItem', content: text('Le clavier s’ouvre et ne cache pas la ligne en cours') },
  { type: 'checkListItem', content: text('La sélection au doigt (appui long) fonctionne') },
  { type: 'checkListItem', content: text('La barre de mise en forme reste au-dessus du clavier') },
  { type: 'checkListItem', content: text('Le menu « / » se filtre en tapant') },
  {
    type: 'checkListItem',
    content: text('La correction automatique et la dictée n’abîment pas le texte'),
  },
  {
    type: 'toggleListItem',
    content: text('Une liste dépliable'),
    children: [{ type: 'paragraph', content: text('Son contenu.') }],
  },
  { type: 'quote', content: text('Une citation.') },
  {
    type: 'callout',
    props: { emoji: '📱' },
    content: text('Rien n’est enregistré dans ce bac à sable.'),
  },
  { type: 'divider' },
  { type: 'codeBlock', content: text('const ok = true') },
]

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')

createRoot(root).render(
  <StrictMode>
    <main
      className="mx-auto w-full max-w-[812px] pt-[max(2rem,env(safe-area-inset-top))] pr-4 pb-40 pl-10 md:px-14"
      style={{ paddingBottom: 'max(10rem, env(safe-area-inset-bottom))' }}
    >
      <p className="mb-6 text-xs text-muted-foreground">
        Nonotion · bac à sable de l’éditeur (test de la phase 2)
      </p>
      <BlockEditor content={SAMPLE} onChange={() => {}} onExitTop={() => {}} />
    </main>
  </StrictMode>,
)
