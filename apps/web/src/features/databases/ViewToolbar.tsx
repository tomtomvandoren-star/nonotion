import {
  boardGroupable,
  type DatabaseDetail,
  type DatabaseView,
  type FilterGroup,
  type FilterRule,
  GROUPABLE_TYPES,
  isActiveRule,
  operatorsFor,
  type Property,
  propertiesById,
  RELATIVE_DATES,
  type SortRule,
  VALUELESS_OPERATORS,
  type ViewConfig,
} from '@nonotion/shared'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarPlus,
  ChevronDown,
  Ellipsis,
  ListFilter,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { visibleColumns } from './columns'
import { newRule, OPERATOR_LABELS, RELATIVE_DATE_LABELS, withOperator } from './filterLabels'
import { PropertyIcon } from './propertyDisplay'

const toolButton =
  'flex h-7 items-center gap-1 rounded-sm px-2 text-sm text-muted-foreground hover:bg-accent data-[active=true]:bg-primary/10 data-[active=true]:text-primary touch:h-10'
const selectClass =
  'h-7 min-w-0 rounded-sm border border-border bg-background px-1.5 text-sm outline-none focus-visible:border-primary'

/**
 * Barre d'outils de la vue (spec 6.6), collante en haut quand on fait défiler : à droite Filtre, Tri,
 * Recherche, Options et le bouton « Nouveau », là où l'œil cherche « ajouter ».
 */
export function ViewToolbar({
  database,
  view,
  onConfig,
  search,
  onSearch,
  filterOpen,
  onFilterOpen,
  onNew,
  leading,
  newLabel = 'Nouveau',
  newMenu,
  onShowFeed,
}: {
  database: DatabaseDetail
  view: DatabaseView
  onConfig: (config: ViewConfig) => void
  search: string
  onSearch: (search: string) => void
  filterOpen: boolean
  onFilterOpen: (open: boolean) => void
  onNew: () => void
  /** À gauche : les commandes propres à la vue (la période d'un calendrier). */
  leading?: React.ReactNode
  newLabel?: string
  /** Les éléments du menu ▾ du bouton (« Importer un agenda… ») ; sans eux, pas de flèche. */
  newMenu?: React.ReactNode
  /** « Créer un lien ICS » : la base dans Google Agenda, le Calendrier Apple, Outlook… */
  onShowFeed: () => void
}) {
  const config = view.config
  const byId = propertiesById(database.schema)
  const activeFilters = (config.filters?.rules ?? []).filter((rule) =>
    isActiveRule(rule, byId.get(rule.property)),
  ).length
  const sorts = (config.sorts ?? []).filter((sort) => byId.has(sort.property))
  const [searching, setSearching] = useState(search !== '')

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-end gap-0.5 bg-background py-1">
      {leading}
      <Popover open={filterOpen} onOpenChange={onFilterOpen}>
        <PopoverTrigger asChild>
          {/* Un filtre actif colore le bouton et montre combien de règles : la vue est filtrée. */}
          <button type="button" data-active={activeFilters > 0} className={toolButton}>
            <ListFilter aria-hidden className="size-4" />
            Filtre{activeFilters > 0 && <span className="tabular-nums"> · {activeFilters}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto max-w-[min(92vw,560px)] p-2">
          <FilterPanel
            schema={database.schema}
            filters={config.filters ?? { operator: 'and', rules: [] }}
            onChange={(filters) => onConfig({ ...config, filters })}
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" data-active={sorts.length > 0} className={toolButton}>
            <ArrowUpDown aria-hidden className="size-4" />
            Tri{sorts.length > 0 && <span className="tabular-nums"> · {sorts.length}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto max-w-[min(92vw,480px)] p-2">
          <SortPanel
            schema={database.schema}
            sorts={sorts}
            onChange={(next) => onConfig({ ...config, sorts: next })}
          />
        </PopoverContent>
      </Popover>

      {searching ? (
        <div className="flex h-7 items-center gap-1 rounded-sm border border-border px-1.5">
          <Search aria-hidden className="size-4 text-muted-foreground" />
          <input
            autoFocus
            aria-label="Rechercher dans la base"
            value={search}
            placeholder="Rechercher…"
            onChange={(event) => onSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                onSearch('')
                setSearching(false)
              }
            }}
            className="w-32 bg-transparent text-sm outline-none focus-visible:outline-none"
          />
          <button
            type="button"
            aria-label="Fermer la recherche"
            onClick={() => {
              onSearch('')
              setSearching(false)
            }}
            className="rounded-sm text-muted-foreground hover:bg-accent"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-label="Rechercher"
          onClick={() => setSearching(true)}
          className={toolButton}
        >
          <Search aria-hidden className="size-4" />
        </button>
      )}

      <OptionsMenu database={database} view={view} onConfig={onConfig} onShowFeed={onShowFeed} />

      <div className="ml-1 flex h-7 items-stretch overflow-hidden rounded-sm bg-primary text-sm font-medium text-primary-foreground">
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-1 px-2.5 hover:bg-primary/90"
        >
          <Plus aria-hidden className="size-4" /> {newLabel}
        </button>
        {newMenu && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Autres façons d’${newLabel === 'Ajouter' ? 'ajouter' : 'ajouter un élément'}`}
                className="flex items-center border-l border-primary-foreground/25 px-1 hover:bg-primary/90"
              >
                <ChevronDown aria-hidden className="size-4" />
              </button>
            </DropdownMenuTrigger>
            {/* Le focus ne revient pas sur la flèche à la fermeture : une fenêtre ouverte depuis le
                menu (import d'agenda) se refermerait aussitôt sur certains appareils. */}
            <DropdownMenuContent
              align="end"
              className="w-64"
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              {newMenu}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

/** Les filtres : chaque règle « [Propriété] [opérateur] [valeur] », reliées par ET ou OU. */
function FilterPanel({
  schema,
  filters,
  onChange,
}: {
  schema: readonly Property[]
  filters: FilterGroup
  onChange: (filters: FilterGroup) => void
}) {
  const byId = propertiesById(schema)
  const setRule = (index: number, rule: FilterRule) =>
    onChange({ ...filters, rules: filters.rules.map((item, i) => (i === index ? rule : item)) })

  return (
    <div className="grid gap-1.5">
      {filters.rules.length === 0 && (
        <p className="px-1 py-1 text-sm text-muted-foreground">Aucun filtre dans cette vue.</p>
      )}
      {filters.rules.map((rule, index) => {
        const property = byId.get(rule.property)
        if (!property) return null
        return (
          <div
            key={index}
            className="flex flex-wrap items-center gap-1.5"
            data-testid="filter-rule"
          >
            <div className="w-14 text-sm text-muted-foreground">
              {index === 0 ? (
                'Où'
              ) : index === 1 ? (
                <select
                  aria-label="Relier les filtres par"
                  value={filters.operator}
                  onChange={(event) =>
                    onChange({ ...filters, operator: event.target.value as 'and' | 'or' })
                  }
                  className={cn(selectClass, 'w-full')}
                >
                  <option value="and">Et</option>
                  <option value="or">Ou</option>
                </select>
              ) : (
                <span className="px-1.5">{filters.operator === 'and' ? 'Et' : 'Ou'}</span>
              )}
            </div>
            <select
              aria-label="Propriété filtrée"
              value={rule.property}
              onChange={(event) => {
                const next = byId.get(event.target.value)
                if (next) setRule(index, newRule(next))
              }}
              className={cn(selectClass, 'max-w-36')}
            >
              {schema.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Opérateur"
              value={rule.op}
              onChange={(event) => setRule(index, withOperator(rule, property, event.target.value))}
              className={selectClass}
            >
              {operatorsFor(property.type).map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_LABELS[op]}
                </option>
              ))}
            </select>
            {!VALUELESS_OPERATORS.has(rule.op) && (
              <FilterValue
                key={`${rule.property}-${rule.op}`}
                property={property}
                rule={rule}
                onChange={(value) => setRule(index, { ...rule, value })}
              />
            )}
            <button
              type="button"
              aria-label="Retirer ce filtre"
              onClick={() =>
                onChange({ ...filters, rules: filters.rules.filter((_, i) => i !== index) })
              }
              className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        )
      })}
      <AddRuleButton
        schema={schema}
        label="Ajouter un filtre"
        onAdd={(property) => onChange({ ...filters, rules: [...filters.rules, newRule(property)] })}
      />
    </div>
  )
}

function FilterValue({
  property,
  rule,
  onChange,
}: {
  property: Property
  rule: FilterRule
  onChange: (value: unknown) => void
}) {
  // Le texte tapé est gardé ici et envoyé à chaque lettre (la vue le reçoit sans délai). Le champ
  // est recréé quand la règle change de propriété ou d'opérateur (clé posée par le parent).
  const [text, setText] = useState(
    rule.value === undefined || rule.value === null ? '' : String(rule.value),
  )

  switch (property.type) {
    case 'title':
    case 'text':
      return (
        <input
          aria-label="Valeur du filtre"
          value={text}
          placeholder="Valeur…"
          onChange={(event) => {
            setText(event.target.value)
            onChange(event.target.value)
          }}
          className={cn(selectClass, 'w-36')}
        />
      )
    case 'number':
      return (
        <input
          aria-label="Valeur du filtre"
          inputMode="decimal"
          value={text}
          placeholder="Nombre…"
          onChange={(event) => {
            setText(event.target.value)
            const number = Number(event.target.value.replace(',', '.'))
            onChange(
              event.target.value.trim() === '' || !Number.isFinite(number) ? undefined : number,
            )
          }}
          className={cn(selectClass, 'w-24')}
        />
      )
    case 'checkbox':
      return (
        <select
          aria-label="Valeur du filtre"
          value={rule.value === false ? 'false' : 'true'}
          onChange={(event) => onChange(event.target.value === 'true')}
          className={selectClass}
        >
          <option value="true">Cochée</option>
          <option value="false">Non cochée</option>
        </select>
      )
    case 'date': {
      const relative = (RELATIVE_DATES as readonly unknown[]).includes(rule.value)
      return (
        <span className="flex gap-1">
          <select
            aria-label="Date du filtre"
            value={relative ? String(rule.value) : rule.value ? 'exact' : ''}
            onChange={(event) =>
              onChange(event.target.value === 'exact' ? '' : event.target.value || undefined)
            }
            className={selectClass}
          >
            <option value="">Choisir…</option>
            {RELATIVE_DATES.map((key) => (
              <option key={key} value={key}>
                {RELATIVE_DATE_LABELS[key]}
              </option>
            ))}
            <option value="exact">Date précise</option>
          </select>
          {!relative && rule.value !== undefined && (
            <input
              type="date"
              aria-label="Date précise du filtre"
              value={typeof rule.value === 'string' ? rule.value : ''}
              onChange={(event) => onChange(event.target.value)}
              className={selectClass}
            />
          )}
        </span>
      )
    }
    case 'select':
    case 'status':
    case 'multi_select':
      return (
        <select
          aria-label="Valeur du filtre"
          value={typeof rule.value === 'string' ? rule.value : ''}
          onChange={(event) => onChange(event.target.value || undefined)}
          className={cn(selectClass, 'max-w-36')}
        >
          <option value="">Choisir…</option>
          {property.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      )
  }
}

/** Les tris : propriété et sens, dans l'ordre d'application (réordonnables). */
function SortPanel({
  schema,
  sorts,
  onChange,
}: {
  schema: readonly Property[]
  sorts: SortRule[]
  onChange: (sorts: SortRule[]) => void
}) {
  const move = (index: number, step: number) => {
    const next = [...sorts]
    const [item] = next.splice(index, 1)
    next.splice(index + step, 0, item!)
    onChange(next)
  }
  return (
    <div className="grid gap-1.5">
      {sorts.length === 0 && (
        <p className="px-1 py-1 text-sm text-muted-foreground">Aucun tri : ordre manuel.</p>
      )}
      {sorts.map((sort, index) => (
        <div
          key={`${sort.property}-${index}`}
          className="flex items-center gap-1.5"
          data-testid="sort-rule"
        >
          <select
            aria-label="Trier par"
            value={sort.property}
            onChange={(event) =>
              onChange(
                sorts.map((item, i) =>
                  i === index ? { ...item, property: event.target.value } : item,
                ),
              )
            }
            className={cn(selectClass, 'max-w-40')}
          >
            {schema.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Sens du tri"
            value={sort.direction}
            onChange={(event) =>
              onChange(
                sorts.map((item, i) =>
                  i === index ? { ...item, direction: event.target.value as 'asc' | 'desc' } : item,
                ),
              )
            }
            className={selectClass}
          >
            <option value="asc">Croissant</option>
            <option value="desc">Décroissant</option>
          </select>
          <button
            type="button"
            aria-label="Appliquer ce tri plus tôt"
            disabled={index === 0}
            onClick={() => move(index, -1)}
            className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent disabled:opacity-30"
          >
            <ArrowUp aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Appliquer ce tri plus tard"
            disabled={index === sorts.length - 1}
            onClick={() => move(index, 1)}
            className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent disabled:opacity-30"
          >
            <ArrowDown aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Retirer ce tri"
            onClick={() => onChange(sorts.filter((_, i) => i !== index))}
            className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ))}
      <AddRuleButton
        schema={schema}
        label="Ajouter un tri"
        onAdd={(property) => onChange([...sorts, { property: property.id, direction: 'asc' }])}
      />
    </div>
  )
}

function AddRuleButton({
  schema,
  label,
  onAdd,
}: {
  schema: readonly Property[]
  label: string
  onAdd: (property: Property) => void
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-7 items-center gap-1 rounded-sm px-1.5 text-sm text-muted-foreground hover:bg-accent"
        >
          <Plus aria-hidden className="size-4" /> {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {schema.map((property) => (
          <DropdownMenuItem key={property.id} onSelect={() => onAdd(property)}>
            <PropertyIcon type={property.type} className="text-current" /> {property.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** « ⋯ Options » : regroupement, ouverture des pages, propriétés visibles. */
function OptionsMenu({
  database,
  view,
  onConfig,
  onShowFeed,
}: {
  database: DatabaseDetail
  view: DatabaseView
  onConfig: (config: ViewConfig) => void
  onShowFeed: () => void
}) {
  const config = view.config
  // Un Board a toujours des colonnes : une Sélection, une Sélection multiple ou un Statut.
  const board = view.type === 'board'
  const groupable = board
    ? boardGroupable(database.schema)
    : database.schema.filter((property) => GROUPABLE_TYPES.includes(property.type))
  const visible = new Set(visibleColumns(database.schema, config).map((property) => property.id))
  const groupBy = config.group_by?.property ?? ''

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Options de la vue" className={toolButton}>
          <Ellipsis aria-hidden className="size-4" />
        </button>
      </DropdownMenuTrigger>
      {/* Le panneau du lien ICS prend le focus : le menu ne le rend pas à son bouton en se fermant. */}
      <DropdownMenuContent
        align="end"
        className="w-60"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {board ? 'Colonnes par' : 'Regrouper par'}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={groupBy}
              onValueChange={(value) =>
                onConfig({
                  ...config,
                  group_by: value
                    ? { property: value, hide_empty: config.group_by?.hide_empty }
                    : null,
                })
              }
            >
              {!board && <DropdownMenuRadioItem value="">Aucun regroupement</DropdownMenuRadioItem>}
              {groupable.map((property) => (
                <DropdownMenuRadioItem key={property.id} value={property.id}>
                  {property.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {groupable.length === 0 && (
              <DropdownMenuLabel className="font-normal text-muted-foreground">
                {board
                  ? 'Ajoutez une Sélection ou un Statut.'
                  : 'Ajoutez une Sélection, un Statut ou une Case à cocher.'}
              </DropdownMenuLabel>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {config.group_by && (
          <DropdownMenuCheckboxItem
            checked={config.group_by.hide_empty === true}
            onCheckedChange={(checked) =>
              onConfig({
                ...config,
                group_by: { ...config.group_by!, hide_empty: checked === true },
              })
            }
          >
            Masquer les groupes vides
          </DropdownMenuCheckboxItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Ouvrir les pages</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={config.open_pages_in ?? 'side_peek'}
              onValueChange={(value) =>
                onConfig({ ...config, open_pages_in: value as ViewConfig['open_pages_in'] })
              }
            >
              <DropdownMenuRadioItem value="side_peek">En aperçu à droite</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="center_modal">Au centre</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="full_page">En pleine page</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => setTimeout(onShowFeed, 0)}>
          <CalendarPlus aria-hidden /> Créer un lien ICS…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Propriétés affichées
        </DropdownMenuLabel>
        {database.schema
          .filter((property) => property.type !== 'title')
          .map((property) => (
            <DropdownMenuCheckboxItem
              key={property.id}
              checked={visible.has(property.id)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) => {
                const ids = visibleColumns(database.schema, config).map((p) => p.id)
                onConfig({
                  ...config,
                  visible_properties: checked
                    ? [...ids, property.id]
                    : ids.filter((id) => id !== property.id),
                })
              }}
            >
              <PropertyIcon type={property.type} className="text-current" /> {property.name}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
