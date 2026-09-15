'use client'

import * as React from 'react'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AnimatePresence, motion } from 'framer-motion'
import { GripVertical, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Span = 1 | 2 | 3

const SPAN_CLASS: Record<Span, string> = {
  1: 'xl:col-span-1',
  2: 'xl:col-span-2',
  3: 'xl:col-span-3',
}

export function Widget({
  id,
  title,
  children,
  defaultSpan = 1,
  resizable = true,
}: {
  id: string
  title?: string
  children: React.ReactNode
  defaultSpan?: Span
  resizable?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  const [span, setSpan] = React.useState<Span>(defaultSpan)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-widget={id}
      className={cn(
        'group/widget relative col-span-1',
        SPAN_CLASS[span],
        isDragging && 'z-20 opacity-90',
      )}
    >
      <div
        className={cn(
          'relative h-full rounded-2xl border bg-card/70 backdrop-blur-sm transition-shadow',
          'shadow-sm hover:shadow-md',
          isDragging && 'shadow-xl ring-2 ring-primary/40',
        )}
      >
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/[0.03] via-transparent to-transparent" />

        <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/widget:opacity-100">
          {resizable && (
            <button
              type="button"
              onClick={() => setSpan((s) => (s === 3 ? 1 : ((s + 1) as Span)))}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Resize widget"
              title="Resize"
            >
              {span === 3 ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          )}
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex size-6 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            <GripVertical className="size-3.5" />
          </button>
        </div>

        {title && (
          <div className="flex items-center px-5 pt-4">
            <h3 className="text-sm font-medium">{title}</h3>
          </div>
        )}
        <div className={cn(title ? 'p-5 pt-3' : 'p-0')}>{children}</div>
      </div>
    </div>
  )
}

export function WidgetGrid({
  storageKey,
  children,
}: {
  storageKey: string
  children: React.ReactElement[]
}) {
  const initialOrder = React.Children.map(children, (c) => c.props.id) ?? []
  const [order, setOrder] = React.useState<string[]>(initialOrder)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    try {
      const saved = window.localStorage.getItem(storageKey)
      if (saved) {
        const parsed: string[] = JSON.parse(saved)
        const known = new Set(initialOrder)
        const merged = [
          ...parsed.filter((id) => known.has(id)),
          ...initialOrder.filter((id) => !parsed.includes(id)),
        ]
        if (merged.length) setOrder(merged)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    } catch {
      /* ignore — localStorage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const byId = new Map(React.Children.map(children, (c) => [c.props.id as string, c]))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id))
      const newIndex = prev.indexOf(String(over.id))
      const next = arrayMove(prev, oldIndex, newIndex)
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const items = mounted ? order : initialOrder

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={rectSortingStrategy}>
        <motion.div
          layout
          className="grid grid-cols-1 gap-4 xl:grid-cols-3"
        >
          <AnimatePresence initial={false}>
            {items.map((id) => {
              const child = byId.get(id)
              if (!child) return null
              return (
                <motion.div
                  key={id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25 }}
                  className="contents"
                >
                  {child}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      </SortableContext>
    </DndContext>
  )
}
