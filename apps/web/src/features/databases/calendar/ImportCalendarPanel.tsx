import {
  type CalendarPreview,
  OPTION_COLOR_LABELS,
  OPTION_COLORS,
  type OptionColor,
} from '@nonotion/shared'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { SidePanel } from '@/features/layout/SidePanel'
import { previewCalendar } from '@/lib/api/calendars'
import { cn } from '@/lib/utils'
import { formatDate } from '../values'
import { calendarError, plural, useImportCalendar, useSyncCalendar } from './calendarQueries'
import { DEVICE_TIME_ZONE, parseDay } from './dates'

const COLORS = OPTION_COLORS.filter((color) => color !== 'default')
const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const field =
  'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary'

/**
 * « Importer un agenda depuis un lien (ICS) » (spec 6.9), en deux étapes : le lien et ses réglages
 * (nom, couleur, mise à jour, base), puis l'aperçu (combien d'événements, sur quelle période, les
 * prochains). On voit avant d'engager : pas 2 000 événements dans la base par erreur. Dans le même
 * panneau à droite que l'aperçu d'une tâche.
 */
export function ImportCalendarPanel({
  workspaceId,
  destinations,
  currentId,
  initialDestination,
  newBaseUnder,
  onClose,
}: {
  workspaceId: string
  /** Les bases où ranger les événements : celle de la vue, ou celles de l'Agenda. */
  destinations: { id: string; title: string }[]
  /** La base de la vue où l'on est (« Cette base »). */
  currentId?: string
  /** Le choix proposé d'abord : une base, ou « new » (depuis l'Agenda : ne pas mêler aux tâches). */
  initialDestination?: string
  /** Une nouvelle base d'événements : sous cette page, ou au premier niveau de l'espace (null). */
  newBaseUnder: string | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const importer = useImportCalendar()
  const sync = useSyncCalendar()
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [color, setColor] = useState<OptionColor>('blue')
  const [mode, setMode] = useState<'subscription' | 'one_shot'>('subscription')
  // L'identifiant d'une base, ou « new ».
  const [destination, setDestination] = useState(initialDestination ?? destinations[0]?.id ?? 'new')
  const [preview, setPreview] = useState<CalendarPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const showPreview = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await previewCalendar({
        workspace_id: workspaceId,
        url,
        time_zone: DEVICE_TIME_ZONE,
      })
      setPreview(result)
      if (!name.trim()) setName(result.name ?? '')
    } catch (failure) {
      setError(calendarError(failure))
    } finally {
      setLoading(false)
    }
  }

  const runImport = async () => {
    setError(null)
    try {
      const result = await importer.mutateAsync({
        url,
        name: name.trim() || preview?.name || 'Agenda importé',
        color,
        mode,
        time_zone: DEVICE_TIME_ZONE,
        ...(destination !== 'new'
          ? { database_id: destination }
          : newBaseUnder
            ? { page_id: newBaseUnder }
            : { workspace_id: workspaceId }),
      })
      const page = result.page
      toast.success(
        `${plural(result.imported, 'événement')} importé${result.imported > 1 ? 's' : ''}`,
        {
          ...(page
            ? {
                action: {
                  label: 'Ouvrir',
                  onClick: () => void navigate({ to: '/p/$pageId', params: { pageId: page.id } }),
                },
              }
            : {}),
        },
      )
      onClose()
    } catch (failure) {
      setError(calendarError(failure))
    }
  }

  const updateExisting = async (sourceId: string) => {
    try {
      await sync.mutateAsync(sourceId)
      toast.success('Agenda mis à jour.')
      onClose()
    } catch (failure) {
      setError(calendarError(failure))
    }
  }

  return (
    <SidePanel
      label="Importer un agenda depuis un lien"
      className="max-w-[min(520px,100vw)]"
      onClose={onClose}
    >
      <div className="grid gap-4 px-5 pb-8">
        <header className="grid gap-1">
          <h2 className="text-lg font-semibold">Importer un agenda depuis un lien</h2>
          <p className="text-sm text-muted-foreground">
            {preview
              ? 'Voici ce que contient l’agenda. Rien n’est encore ajouté à la base.'
              : 'Google Agenda, Outlook, iCloud, emploi du temps… sans compte, juste avec un lien.'}
          </p>
        </header>

        {!preview ? (
          <form
            id="calendar-link"
            onSubmit={(event) => void showPreview(event)}
            className="grid gap-4"
          >
            <div className="grid gap-1.5">
              <label htmlFor="calendar-url" className="text-sm font-medium">
                Lien de l’agenda (ICS)
              </label>
              <input
                id="calendar-url"
                required
                autoFocus
                inputMode="url"
                placeholder="https://… ou webcal://…"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className={field}
              />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Où trouver ce lien ?</summary>
                <ul className="mt-1 grid list-disc gap-0.5 pl-4">
                  <li>
                    Google Agenda : Paramètres de l’agenda → « Adresse secrète au format iCal ».
                  </li>
                  <li>Outlook : Calendrier partagé → Publier un calendrier.</li>
                  <li>iCloud : Calendrier public (lien en webcal://).</li>
                  <li>Moodle, Teams, Canvas : « Exporter l’agenda ».</li>
                </ul>
                <p className="mt-1">
                  Ce lien donne accès à votre agenda : Nonotion le garde chiffré et ne l’affiche
                  plus ensuite.
                </p>
              </details>
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="calendar-name" className="text-sm font-medium">
                Nom
              </label>
              <input
                id="calendar-name"
                maxLength={100}
                placeholder="Le nom de l’agenda, s’il en a un"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={field}
              />
            </div>

            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">
                Couleur des événements importés
                <span className="font-normal text-muted-foreground">
                  {' '}
                  · {OPTION_COLOR_LABELS[color]}
                </span>
              </legend>
              <div role="radiogroup" aria-label="Couleur" className="flex flex-wrap gap-1.5">
                {COLORS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={color === value}
                    aria-label={OPTION_COLOR_LABELS[value]}
                    onClick={() => setColor(value)}
                    data-color={value}
                    className={cn(
                      'nn-tint size-7 rounded-full',
                      color === value && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                    )}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="grid gap-1 text-sm">
              <legend className="mb-1.5 font-medium">Mise à jour</legend>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="calendar-mode"
                  checked={mode === 'subscription'}
                  onChange={() => setMode('subscription')}
                  className="mt-1"
                />
                <span>
                  Abonnement
                  <span className="block text-xs text-muted-foreground">
                    Les changements de l’agenda arrivent tout seuls (toutes les 30 minutes environ).
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="calendar-mode"
                  checked={mode === 'one_shot'}
                  onChange={() => setMode('one_shot')}
                  className="mt-1"
                />
                <span>
                  Import unique
                  <span className="block text-xs text-muted-foreground">
                    Une copie des événements d’aujourd’hui, sans mise à jour.
                  </span>
                </span>
              </label>
            </fieldset>

            <div className="grid gap-1.5">
              <label htmlFor="calendar-destination" className="text-sm font-medium">
                Ajouter les événements dans
              </label>
              <select
                id="calendar-destination"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                className={field}
              >
                {destinations.map((base) => (
                  <option key={base.id} value={base.id}>
                    {base.id === currentId ? 'Cette base' : 'La base'} «{' '}
                    {base.title || 'Sans titre'} »
                  </option>
                ))}
                <option value="new">Une nouvelle base d’événements</option>
              </select>
            </div>
          </form>
        ) : (
          <PreviewStep
            preview={preview}
            onUpdateExisting={(id) => void updateExisting(id)}
            updating={sync.isPending}
          />
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {importer.isPending && preview && (
          // L'import d'un gros agenda prend quelques secondes : on le montre.
          <div className="grid gap-1 text-xs text-muted-foreground" role="status">
            Import de {plural(preview.total, 'événement')}…
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/3 animate-[nn-progress_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {preview ? (
            <>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="flex h-9 items-center gap-1 rounded-md px-3 text-sm hover:bg-accent"
              >
                <ArrowLeft aria-hidden className="size-4" /> Retour
              </button>
              <button
                type="button"
                disabled={importer.isPending || preview.duplicate !== null}
                onClick={() => void runImport()}
                className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {importer.isPending ? 'Import en cours…' : 'Importer'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-md px-3 text-sm hover:bg-accent"
              >
                Annuler
              </button>
              <button
                type="submit"
                form="calendar-link"
                disabled={loading}
                className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? 'Lecture de l’agenda…' : 'Prévisualiser'}
              </button>
            </>
          )}
        </div>
      </div>
    </SidePanel>
  )
}

/** L'étape « Aperçu » : le nombre d'événements, la période, les avertissements, les prochains. */
function PreviewStep({
  preview,
  onUpdateExisting,
  updating,
}: {
  preview: CalendarPreview
  onUpdateExisting: (sourceId: string) => void
  updating: boolean
}) {
  return (
    <div className="grid gap-3 text-sm">
      <p className="font-medium" data-testid="calendar-preview-summary">
        {preview.total === 0
          ? 'Aucun événement entre le mois dernier et l’an prochain.'
          : `${plural(preview.total, 'événement')}, du ${dayFormat.format(parseDay(preview.from!))} au ${dayFormat.format(parseDay(preview.to!))}`}
      </p>
      {preview.duplicate && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2">
          <span className="min-w-0 flex-1">
            Cet agenda est déjà importé (« {preview.duplicate.name} »).
          </span>
          <button
            type="button"
            disabled={updating}
            onClick={() => onUpdateExisting(preview.duplicate!.id)}
            className="h-8 rounded-md border border-border bg-background px-2.5 hover:bg-accent disabled:opacity-50"
          >
            Mettre à jour l’existant
          </button>
        </div>
      )}
      {preview.warnings.length > 0 && (
        <ul className="grid gap-1 rounded-md bg-amber-500/10 px-3 py-2 text-xs">
          {preview.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5">
              <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0 text-amber-600" />
              {warning}
            </li>
          ))}
        </ul>
      )}
      {preview.events.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Les prochains :</p>
          <ul
            aria-label="Prochains événements"
            className="grid gap-px overflow-hidden rounded-md border border-border"
          >
            {preview.events.map((event, i) => (
              <li key={`${event.start}-${i}`} className="flex gap-3 bg-background px-3 py-1.5">
                <span className="w-36 shrink-0 text-muted-foreground tabular-nums">
                  {formatDate({ start: event.start, end: null })}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {event.title || 'Sans titre'}
                  {event.location && (
                    <span className="text-muted-foreground"> · {event.location}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
