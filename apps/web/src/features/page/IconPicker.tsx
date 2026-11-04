import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PAGE_EMOJIS, randomEmoji } from './covers'

/** Choix de l'icône (un émoji) d'une page. */
export function IconPicker({
  trigger,
  onSelect,
  onRemove,
}: {
  trigger: React.ReactNode
  onSelect: (emoji: string) => void
  onRemove?: () => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <span className="text-xs font-medium text-muted-foreground">Icône</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onSelect(randomEmoji())}
              className="rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              Au hasard
            </button>
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
        </div>
        <div className="grid grid-cols-8 gap-0.5" role="listbox" aria-label="Émojis">
          {PAGE_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onSelect(emoji)}
              className="flex size-8 items-center justify-center rounded-sm text-xl hover:bg-accent touch:size-10"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
