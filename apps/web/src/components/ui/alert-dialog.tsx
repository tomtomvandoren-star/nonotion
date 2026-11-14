import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from 'cn'

import { Button } from '@/components/ui/button'

/*
 * La fenêtre de confirmation (« Supprimer … ? »), volontairement simple : un fond et une carte
 * ajoutés à la page quand elle s'ouvre, sans le mécanisme de fenêtre modale de Radix. Lancée
 * depuis un menu, celle de Radix ne s'affichait pas sur certaines machines (comme les fenêtres
 * d'import d'agenda, devenues des panneaux) ; celle-ci s'affiche partout pareil. Mêmes noms de
 * composants qu'avant : rien ne change là où elle est utilisée.
 */

type AlertDialogContext = {
  open: boolean
  onOpenChange: (open: boolean) => void
  titleId: string
  descriptionId: string
}

const Context = React.createContext<AlertDialogContext | null>(null)

function useAlertDialog(): AlertDialogContext {
  const context = React.useContext(Context)
  if (!context) throw new Error('À utiliser dans <AlertDialog>.')
  return context
}

const noop = () => {}

function AlertDialog({
  open,
  onOpenChange = noop,
  children,
}: {
  open: boolean
  /** Absent : la fenêtre ne se ferme que par ses boutons (Échap ne fait rien). */
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  const id = React.useId()
  const value = React.useMemo(
    () => ({ open, onOpenChange, titleId: `${id}-title`, descriptionId: `${id}-description` }),
    [open, onOpenChange, id],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex="0"]'

function AlertDialogContent({
  className,
  size = 'default',
  children,
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  const { open, onOpenChange, titleId, descriptionId } = useAlertDialog()
  const card = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const before = document.activeElement
    // « Annuler » d'abord : Entrée, juste après avoir ouvert, ne supprime rien par accident.
    const first =
      card.current?.querySelector<HTMLElement>('[data-slot="alert-dialog-cancel"]') ??
      card.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onOpenChange(false)
        return
      }
      if (event.key !== 'Tab' || !card.current) return
      // Tab reste dans la fenêtre : du dernier bouton, on revient au premier.
      const items = [...card.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const last = items[items.length - 1]
      if (!items[0] || !last) return
      const active = document.activeElement
      if (event.shiftKey && (active === items[0] || !card.current.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !card.current.contains(active))) {
        event.preventDefault()
        items[0].focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (before instanceof HTMLElement && before.isConnected) before.focus()
    }
  }, [open, onOpenChange])

  if (!open) return null
  return createPortal(
    <div
      data-slot="alert-dialog-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div
        ref={card}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          'group/alert-dialog-content grid max-h-full w-full gap-4 overflow-y-auto rounded-xl bg-popover p-4 text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        '-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  const { titleId } = useAlertDialog()
  return (
    <h2
      id={titleId}
      data-slot="alert-dialog-title"
      className={cn('font-heading text-base font-medium', className)}
      {...props}
    />
  )
}

function AlertDialogDescription({ className, ...props }: React.ComponentProps<'p'>) {
  const { descriptionId } = useAlertDialog()
  return (
    <p
      id={descriptionId}
      data-slot="alert-dialog-description"
      className={cn(
        'text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

/** Le bouton qui confirme : fait l'action, puis ferme la fenêtre. */
function AlertDialogAction({
  className,
  variant = 'default',
  size = 'default',
  onClick,
  ...props
}: React.ComponentProps<'button'> & Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  const { onOpenChange } = useAlertDialog()
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      data-slot="alert-dialog-action"
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) onOpenChange(false)
      }}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  variant = 'outline',
  size = 'default',
  onClick,
  ...props
}: React.ComponentProps<'button'> & Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  const { onOpenChange } = useAlertDialog()
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) onOpenChange(false)
      }}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
}
