import type { OptionColor } from '@nonotion/shared'

/** La couleur Nonotion la plus proche de celle d'un agenda Google ou iCloud (« #9fe1e7 »). */
export function nearestColor(hex: string | null): OptionColor {
  const match = hex?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
  if (!match) return 'blue'
  const [r, g, b] = match.slice(1, 4).map((part) => parseInt(part, 16) / 255) as [
    number,
    number,
    number,
  ]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const light = (max + min) / 2
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1))
  if (saturation < 0.15) return 'gray'
  const delta = max - min
  const hue =
    (max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60
  const h = (hue + 360) % 360
  if (h < 15 || h >= 345) return 'red'
  if (h < 45) return light < 0.35 ? 'brown' : 'orange'
  if (h < 65) return 'yellow'
  if (h < 170) return 'green'
  if (h < 250) return 'blue'
  if (h < 290) return 'purple'
  return 'pink'
}
