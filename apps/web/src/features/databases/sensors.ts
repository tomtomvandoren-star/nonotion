import { PointerSensor } from '@dnd-kit/core'

/** Glisser à la souris (le doigt passe par l'appui long du capteur tactile). */
export class MouseOnlyPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent }: React.PointerEvent) =>
        nativeEvent.isPrimary && nativeEvent.button === 0 && nativeEvent.pointerType !== 'touch',
    },
  ]
}
