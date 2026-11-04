import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { COVER_LABELS, COVER_PRESETS, presetCover, type CoverPreset } from './covers'

/** Choix d'une couverture : un dégradé de la palette, ou une image par son lien https. */
export function CoverPicker({
  trigger,
  onSelect,
  onRemove,
}: {
  trigger: React.ReactNode
  onSelect: (coverUrl: string) => void
  onRemove?: () => void
}) {
  const [link, setLink] = useState('')
  const linkIsValid = /^https:\/\/\S+$/.test(link.trim())

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Couverture</span>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              Retirer
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(COVER_PRESETS) as CoverPreset[]).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onSelect(presetCover(name))}
              aria-label={`Couverture ${COVER_LABELS[name]}`}
              className="h-12 rounded-md ring-offset-2 hover:ring-2 hover:ring-primary/50"
              style={{ background: COVER_PRESETS[name] }}
            />
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (linkIsValid) onSelect(link.trim())
          }}
        >
          <Input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://… (lien vers une image)"
            aria-label="Lien vers une image"
          />
          <Button type="submit" variant="secondary" disabled={!linkIsValid}>
            OK
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
