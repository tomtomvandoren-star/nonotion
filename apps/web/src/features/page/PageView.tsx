import type { PageDetail } from '@nonotion/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ImageIcon, SmilePlus } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  applyPagePatchLocally,
  queryKeys,
  SAVE_MUTATION_KEY,
  usePage,
  useUpdatePage,
  useWorkspaceId,
} from '@/features/pages/queries'
import { consumeTitleFocus } from '@/features/pages/useNewPage'
import { ApiError } from '@/lib/api/client'
import { savePageContent } from '@/lib/api/pages'
import { useDebouncedSave } from '@/lib/useDebouncedSave'
import { cn } from '@/lib/utils'
import { CoverPicker } from './CoverPicker'
import { coverStyle, randomCover } from './covers'
import { IconPicker } from './IconPicker'
import { blocksToText, textToBlocks } from './plainText'

/**
 * Une page (spec 6.2) : couverture, icône, titre, puis le corps. Elle doit ressembler
 * à un document, pas à un formulaire.
 */
export function PageView({ pageId }: { pageId: string }) {
  const page = usePage(pageId)

  if (page.isPending)
    return <div className="mx-auto mt-24 h-10 max-w-[700px] animate-pulse rounded bg-muted" />
  if (page.isError) {
    const notFound = page.error instanceof ApiError && page.error.status === 404
    return (
      <div className="mx-auto mt-24 max-w-[700px] px-4 text-center">
        <p className="text-lg font-medium">
          {notFound ? 'Cette page n’existe pas ou plus.' : 'Impossible d’ouvrir cette page.'}
        </p>
        <Link
          to="/"
          className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          Revenir à l’accueil
        </Link>
      </div>
    )
  }

  // La clé remet l'état local à zéro quand on passe d'une page à l'autre.
  return <PageDocument key={page.data.id} page={page.data} />
}

function PageDocument({ page }: { page: PageDetail }) {
  const updatePage = useUpdatePage()
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const cover = page.cover_url ? coverStyle(page.cover_url) : null
  const patch = (values: Parameters<typeof updatePage.mutate>[0]['patch']) =>
    updatePage.mutate({ pageId: page.id, patch: values })

  return (
    <article className="pb-40">
      {cover && (
        <div className="group/cover relative h-[200px] w-full" style={cover}>
          <div className="absolute right-4 bottom-3 flex gap-1 opacity-0 transition-opacity group-hover/cover:opacity-100 focus-within:opacity-100 touch:opacity-100">
            <CoverPicker
              onSelect={(coverUrl) => patch({ cover_url: coverUrl })}
              onRemove={() => patch({ cover_url: null })}
              trigger={
                <button
                  type="button"
                  className="rounded-sm bg-background/85 px-2 py-1 text-xs text-foreground shadow-sm hover:bg-background"
                >
                  Changer la couverture
                </button>
              }
            />
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-[700px] px-4 md:px-0">
        <header className={cn('group/header', cover ? 'pt-0' : 'pt-16')}>
          {page.icon && (
            <IconPicker
              onSelect={(icon) => patch({ icon })}
              onRemove={() => patch({ icon: null })}
              trigger={
                <button
                  type="button"
                  aria-label="Changer l’icône"
                  className={cn(
                    'block rounded-md text-[72px] leading-none hover:bg-accent',
                    cover && 'relative -mt-10',
                  )}
                >
                  {page.icon}
                </button>
              }
            />
          )}

          <PageTitle page={page} onEnter={() => focusBodyStart(bodyRef.current)} />

          {/* Au survol sous le titre, les ajouts possibles ; ils disparaissent une fois faits (spec 6.2). */}
          {(!page.icon || !page.cover_url) && (
            <div className="flex h-8 gap-1 opacity-0 transition-opacity duration-150 group-hover/header:opacity-100 focus-within:opacity-100 touch:opacity-100">
              {!page.icon && (
                <IconPicker
                  onSelect={(icon) => patch({ icon })}
                  trigger={
                    <button type="button" className={headerButton}>
                      <SmilePlus aria-hidden className="size-4" /> Ajouter une icône
                    </button>
                  }
                />
              )}
              {!page.cover_url && (
                <button
                  type="button"
                  className={headerButton}
                  onClick={() => patch({ cover_url: randomCover() })}
                >
                  <ImageIcon aria-hidden className="size-4" /> Ajouter une couverture
                </button>
              )}
            </div>
          )}
        </header>

        <PageBody page={page} textareaRef={bodyRef} />
      </div>
    </article>
  )
}

const headerButton =
  'flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm text-muted-foreground hover:bg-accent touch:h-11'

function focusBodyStart(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return
  textarea.focus()
  textarea.setSelectionRange(0, 0)
}

/** Ajuste la hauteur d'une zone de texte à son contenu (pas de barre de défilement interne). */
function useAutoHeight(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [ref, value])
}

/**
 * Le titre : chaque lettre met à jour tout de suite la barre latérale et le fil d'Ariane
 * (état partagé), l'envoi au serveur suit 500 ms après la dernière frappe.
 */
function PageTitle({ page, onEnter }: { page: PageDetail; onEnter: () => void }) {
  const queryClient = useQueryClient()
  const workspaceId = useWorkspaceId() ?? ''
  const updatePage = useUpdatePage()
  const [value, setValue] = useState(page.title)
  const ref = useRef<HTMLTextAreaElement>(null)
  const save = useDebouncedSave((title: string) =>
    updatePage.mutate({ pageId: page.id, patch: { title } }),
  )
  useAutoHeight(ref, value)

  useEffect(() => {
    if (consumeTitleFocus(page.id)) ref.current?.focus()
  }, [page.id])

  // Le titre a changé ailleurs (autre appareil, renommage depuis la barre latérale) : on le reprend.
  useEffect(() => {
    if (document.activeElement !== ref.current && !save.hasPending()) setValue(page.title)
  }, [page.title, save])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder="Sans titre"
      aria-label="Titre de la page"
      onChange={(event) => {
        const title = event.target.value.replace(/\n/g, ' ')
        setValue(title)
        applyPagePatchLocally(queryClient, workspaceId, page.id, { title })
        save.schedule(title)
      }}
      onKeyDown={(event) => {
        // Entrée ne crée pas de saut de ligne : elle passe au corps de la page (spec 6.2).
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          save.flush()
          onEnter()
        }
      }}
      onBlur={save.flush}
      className="block w-full resize-none overflow-hidden bg-transparent py-1 text-[40px] leading-tight font-bold outline-none placeholder:text-muted-foreground/50 focus-visible:outline-none"
    />
  )
}

/**
 * Le corps provisoire (texte simple, l'éditeur de blocs arrive en phase 2) : sauvegarde automatique
 * avec verrouillage optimiste. Si la page a changé sur un autre appareil, on demande quoi faire.
 */
function PageBody({
  page,
  textareaRef,
}: {
  page: PageDetail
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const queryClient = useQueryClient()
  const [text, setText] = useState(() => blocksToText(page.content))
  const version = useRef(page.version)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const [conflict, setConflict] = useState<{ text: string; serverVersion: number } | null>(null)
  useAutoHeight(textareaRef, text)

  const saveContent = useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: ({ value, baseVersion }: { value: string; baseVersion: number }) =>
      savePageContent(page.id, textToBlocks(value), baseVersion),
  })

  /**
   * Les envois partent l'un après l'autre : chacun repart de la version renvoyée par le précédent,
   * sinon deux envois rapprochés se gêneraient (le second recevrait un 409 à tort).
   */
  const send = (value: string, baseVersion?: number) => {
    queue.current = queue.current.then(async () => {
      const from = baseVersion ?? version.current
      try {
        version.current = await saveContent.mutateAsync({ value, baseVersion: from })
        queryClient.setQueryData<PageDetail>(queryKeys.page(page.id), (current) =>
          current
            ? { ...current, content: textToBlocks(value), version: version.current }
            : current,
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const serverVersion = (error.body as { version?: number } | null)?.version ?? from
          setConflict({ text: value, serverVersion })
        } else {
          toast.error('Le contenu n’a pas pu être enregistré.')
        }
      }
    })
  }

  const save = useDebouncedSave((value: string) => send(value))

  // Nouvelle version reçue du serveur (autre appareil) et rien en attente ici : on l'affiche.
  useEffect(() => {
    if (page.version > version.current && !save.hasPending() && conflict === null) {
      version.current = page.version
      setText(blocksToText(page.content))
    }
  }, [page.version, page.content, save, conflict])

  const reload = async () => {
    setConflict(null)
    await queryClient.invalidateQueries({ queryKey: queryKeys.page(page.id) })
    const fresh = queryClient.getQueryData<PageDetail>(queryKeys.page(page.id))
    if (fresh) {
      version.current = fresh.version
      setText(blocksToText(fresh.content))
    }
  }

  const overwrite = () => {
    if (!conflict) return
    setConflict(null)
    send(conflict.text, conflict.serverVersion)
  }

  return (
    <>
      <textarea
        ref={textareaRef}
        value={text}
        aria-label="Contenu de la page"
        placeholder="Écrivez quelque chose…"
        onChange={(event) => {
          setText(event.target.value)
          save.schedule(event.target.value)
        }}
        onBlur={save.flush}
        className="mt-2 block min-h-40 w-full resize-none overflow-hidden bg-transparent leading-normal outline-none placeholder:text-muted-foreground/60 focus-visible:outline-none"
      />

      <AlertDialog open={conflict !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cette page a été modifiée ailleurs</AlertDialogTitle>
            <AlertDialogDescription>
              Elle a changé sur un autre appareil depuis que vous l’avez ouverte. Rechargez-la pour
              voir la dernière version, ou écrasez-la avec la vôtre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => void reload()}>Recharger</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={overwrite}>
              Écraser avec ma version
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
