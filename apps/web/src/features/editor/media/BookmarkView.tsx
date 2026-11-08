import { Globe, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '@/lib/api/client'
import { fetchLinkPreview } from '@/lib/api/media'
import { isWebUrl, normalizeWebUrl } from './urls'

/** Ce que garde un bloc « Aperçu de lien ». */
export type BookmarkProps = {
  url: string
  title: string
  description: string
  image: string
  icon: string
  siteName: string
}

/** Un aperçu pas encore créé : le champ du lien. */
export function BookmarkForm({
  editable,
  onDone,
}: {
  editable: boolean
  onDone: (props: BookmarkProps) => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    const url = normalizeWebUrl(value)
    if (!url) {
      setError('Ce lien n’est pas une adresse web (https://…).')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const preview = await fetchLinkPreview(url)
      onDone({
        url: preview.url,
        title: preview.title ?? '',
        description: preview.description ?? '',
        image: preview.image ?? '',
        icon: preview.icon ?? '',
        siteName: preview.site_name ?? '',
      })
    } catch (caught) {
      // Lien refusé (adresse privée, page introuvable…) : on le dit. Serveur injoignable : un
      // aperçu sans titre, le lien reste utilisable.
      if (caught instanceof ApiError && caught.status === 422) {
        setError(caught.fieldError('url') ?? caught.message)
      } else {
        const host = new URL(url).hostname.replace(/^www\./, '')
        onDone({ url, title: '', description: '', image: '', icon: '', siteName: host })
      }
    } finally {
      setLoading(false)
    }
  }

  if (!editable) return <div className="nn-bookmark-empty" />
  return (
    <form
      className="nn-bookmark-form flex w-full flex-col gap-1.5 rounded-md border border-border bg-muted/40 p-3"
      contentEditable={false}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Globe aria-hidden className="size-4 shrink-0" />
        Aperçu de lien
      </span>
      <div className="flex gap-2">
        <input
          type="url"
          inputMode="url"
          aria-label="Lien de l’aperçu"
          placeholder="Collez un lien (https://…)"
          value={value}
          disabled={loading}
          onChange={(event) => setValue(event.target.value)}
          // L'éditeur ne doit pas prendre ces touches (Entrée créerait un bloc, Retour en effacerait).
          onKeyDown={(event) => event.stopPropagation()}
          className="h-8 min-w-0 flex-1 rounded-sm border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring touch:h-11"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50 touch:h-11"
        >
          {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
          Créer l’aperçu
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

/** L'aperçu : titre, description, adresse et image de la page ; un toucher ouvre le lien. */
export function BookmarkCard({ url, title, description, image, icon, siteName }: BookmarkProps) {
  const [brokenImage, setBrokenImage] = useState(false)
  const [brokenIcon, setBrokenIcon] = useState(false)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      draggable={false}
      contentEditable={false}
      aria-label={title ? `${title} (${siteName || url})` : url}
      className="nn-bookmark flex w-full overflow-hidden rounded-md border border-border text-foreground no-underline hover:bg-accent/50"
    >
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3.5 py-3">
        <span className="truncate text-sm font-medium">{title || url}</span>
        {description && (
          <span className="line-clamp-2 text-xs text-muted-foreground">{description}</span>
        )}
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {isWebUrl(icon) && !brokenIcon ? (
            <img
              src={icon}
              alt=""
              referrerPolicy="no-referrer"
              className="size-4 shrink-0"
              onError={() => setBrokenIcon(true)}
            />
          ) : (
            <Globe aria-hidden className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{url}</span>
        </span>
      </span>
      {isWebUrl(image) && !brokenImage && (
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          className="hidden max-h-32 w-[32%] max-w-60 shrink-0 object-cover sm:block"
          onError={() => setBrokenImage(true)}
        />
      )}
    </a>
  )
}
