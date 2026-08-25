'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminPageShell } from '@/app/admin/_components/AdminPageShell'
import {
  deleteVenueLandmark,
  loadAdminFloorLayout,
  saveFloorLayoutTables,
  upsertVenueLandmark,
  type FloorLayoutTable,
  type VenueLandmarkRow,
} from '@/lib/admin-floor-layout'
import {
  FLOOR_GRID_COLS,
  FLOOR_GRID_ROWS,
  FLOOR_DEFAULT_LANDMARK_SPAN,
  FLOOR_TABLE_LAYOUT_DEFAULTS,
  VENUE_LANDMARK_KINDS,
  VENUE_LANDMARK_COLOR_PRESETS,
  VENUE_LANDMARK_ROTATIONS,
  VENUE_LANDMARK_SHAPES,
  clampGridCoord,
  clampGridSpan,
  landmarkBorderRadius,
  landmarkLabelStyle,
  landmarkLineEndpoints,
  normalizeFloorRect,
  normalizeLandmarkLineRect,
  normalizeLandmarkRotation,
  normalizeLandmarkShape,
  resolveTableGridUnits,
  tableGridUnitsForCapacity,
  type FloorGridRect,
} from '@/lib/floor-layout'
import { groupTablesByTeamId } from '@/lib/table-teams'

type DragTarget =
  | { type: 'table'; id: string }
  | { type: 'landmark'; id: string }

type DraftState = {
  tables: FloorLayoutTable[]
  landmarks: VenueLandmarkRow[]
}

function tableRect(t: FloorLayoutTable): FloorGridRect {
  const units = resolveTableGridUnits(t.capacity, t)
  return normalizeFloorRect({ ...t, ...units }, { w: units.width_units, h: units.height_units })
}

function normalizeTableForLayout(t: FloorLayoutTable): FloorLayoutTable {
  return { ...t, ...tableRect(t) }
}

function patchTableRect(t: FloorLayoutTable, rect: FloorGridRect): FloorLayoutTable {
  return { ...t, ...rect }
}

function patchLandmarkRect(l: VenueLandmarkRow, rect: Partial<FloorGridRect>): VenueLandmarkRow {
  const normalized = l.is_line
    ? normalizeLandmarkLineRect({ ...l, ...rect })
    : normalizeFloorRect({ ...l, ...rect }, FLOOR_DEFAULT_LANDMARK_SPAN)
  return { ...l, ...normalized }
}

/** Auto-place tables without coordinates using team lanes (matches guest map fallback). */
function autoPlaceTables(tables: FloorLayoutTable[]): FloorLayoutTable[] {
  const laneYs = [5, 9, 13, 17]
  const teams = [...groupTablesByTeamId(tables)].sort((a, b) => {
    const minOrd = (members: FloorLayoutTable[]) =>
      Math.min(...members.map((t) => t.display_order))
    const d = minOrd(a[1]) - minOrd(b[1])
    if (d !== 0) return d
    return a[1][0]!.name.localeCompare(b[1][0]!.name, undefined, { sensitivity: 'base' })
  })

  const placed = new Map<string, FloorLayoutTable>()
  teams.slice(0, laneYs.length).forEach(([, members], laneIdx) => {
    const y = laneYs[laneIdx]!
    const sorted = [...members].sort((a, b) => a.display_order - b.display_order)
    const count = sorted.length
    const xs =
      count <= 1
        ? [Math.floor(FLOOR_GRID_COLS / 2)]
        : count === 2
          ? [6, FLOOR_GRID_COLS - 7]
          : Array.from({ length: count }, (_, i) =>
              Math.round(6 + ((FLOOR_GRID_COLS - 14) * i) / Math.max(1, count - 1))
            )

    sorted.forEach((t, i) => {
      const span = tableGridUnitsForCapacity(t.capacity)
      const rect = normalizeFloorRect(
        {
          grid_x: (xs[i] ?? 10) - Math.floor(span.width_units / 2),
          grid_y: y,
          width_units: span.width_units,
          height_units: span.height_units,
        },
        { w: span.width_units, h: span.height_units }
      )
      placed.set(t.id, patchTableRect(t, rect))
    })
  })

  return tables.map((t) => placed.get(t.id) ?? t)
}

function GridNumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-zinc-500">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const parsed = Math.trunc(Number(e.target.value))
          const fallback = min > 0 ? min : 0
          onChange(Number.isFinite(parsed) ? parsed : fallback)
        }}
        className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
      />
    </label>
  )
}

export default function AdminFloorLayoutPage() {
  const [draft, setDraft] = useState<DraftState>({ tables: [], landmarks: [] })
  const [saved, setSaved] = useState<DraftState>({ tables: [], landmarks: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [selected, setSelected] = useState<DragTarget | null>(null)
  const [dragging, setDragging] = useState<
    | {
        mode: 'move'
        target: DragTarget
        offsetCol: number
        offsetRow: number
      }
    | {
        mode: 'line-end'
        landmarkId: string
        endpoint: 'start' | 'end'
      }
    | null
  >(null)

  const canvasRef = useRef<HTMLDivElement | null>(null)

  const isDirty = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(saved)
  }, [draft, saved])

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const { tables, landmarks } = await loadAdminFloorLayout()
      const next = {
        tables: tables.map(normalizeTableForLayout),
        landmarks,
      }
      setDraft(next)
      setSaved(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load floor plan.')
      setDraft({ tables: [], landmarks: [] })
      setSaved({ tables: [], landmarks: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const activeTables = useMemo(
    () => draft.tables.filter((t) => t.is_active),
    [draft.tables]
  )

  const stackedTables = useMemo(
    () =>
      activeTables.filter(
        (t) =>
          t.grid_x === FLOOR_TABLE_LAYOUT_DEFAULTS.grid_x &&
          t.grid_y === FLOOR_TABLE_LAYOUT_DEFAULTS.grid_y
      ),
    [activeTables]
  )

  const selectedTable = useMemo(() => {
    if (selected?.type !== 'table') return null
    return draft.tables.find((t) => t.id === selected.id) ?? null
  }, [draft.tables, selected])

  const selectedLandmark = useMemo(() => {
    if (selected?.type !== 'landmark') return null
    return draft.landmarks.find((l) => l.id === selected.id) ?? null
  }, [draft.landmarks, selected])

  const cellFromPointer = useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current
    if (!el) return { col: 0, row: 0 }
    const rect = el.getBoundingClientRect()
    const col = Math.floor(((clientX - rect.left) / rect.width) * FLOOR_GRID_COLS)
    const row = Math.floor(((clientY - rect.top) / rect.height) * FLOOR_GRID_ROWS)
    return {
      col: Math.min(FLOOR_GRID_COLS - 1, Math.max(0, col)),
      row: Math.min(FLOOR_GRID_ROWS - 1, Math.max(0, row)),
    }
  }, [])

  const moveTarget = useCallback(
    (target: DragTarget, col: number, row: number, offsetCol: number, offsetRow: number) => {
      setDraft((prev) => {
        if (target.type === 'table') {
          const table = prev.tables.find((t) => t.id === target.id)
          if (!table) return prev
          const span = {
            w: table.width_units,
            h: table.height_units,
          }
          const rect = normalizeFloorRect(
            {
              grid_x: col - offsetCol,
              grid_y: row - offsetRow,
              width_units: span.w,
              height_units: span.h,
            },
            span
          )
          return {
            ...prev,
            tables: prev.tables.map((t) => (t.id === target.id ? patchTableRect(t, rect) : t)),
          }
        }

        const landmark = prev.landmarks.find((l) => l.id === target.id)
        if (!landmark) return prev
        const rect = landmark.is_line
          ? normalizeLandmarkLineRect({
              grid_x: col - offsetCol,
              grid_y: row - offsetRow,
              width_units: landmark.width_units,
              height_units: landmark.height_units,
            })
          : normalizeFloorRect(
              {
                grid_x: col - offsetCol,
                grid_y: row - offsetRow,
                width_units: landmark.width_units,
                height_units: landmark.height_units,
              },
              FLOOR_DEFAULT_LANDMARK_SPAN
            )
        return {
          ...prev,
          landmarks: prev.landmarks.map((l) =>
            l.id === target.id ? patchLandmarkRect(l, rect) : l
          ),
        }
      })
    },
    []
  )

  const moveLineEndpoint = useCallback(
    (landmarkId: string, endpoint: 'start' | 'end', col: number, row: number) => {
      setDraft((prev) => {
        const landmark = prev.landmarks.find((l) => l.id === landmarkId)
        if (!landmark?.is_line) return prev

        if (endpoint === 'end') {
          return {
            ...prev,
            landmarks: prev.landmarks.map((l) =>
              l.id === landmarkId
                ? patchLandmarkRect(l, {
                    width_units: col - l.grid_x,
                    height_units: row - l.grid_y,
                  })
                : l
            ),
          }
        }

        const endCol = landmark.grid_x + landmark.width_units
        const endRow = landmark.grid_y + landmark.height_units
        return {
          ...prev,
          landmarks: prev.landmarks.map((l) =>
            l.id === landmarkId
              ? patchLandmarkRect(l, {
                  grid_x: col,
                  grid_y: row,
                  width_units: endCol - col,
                  height_units: endRow - row,
                })
              : l
          ),
        }
      })
    },
    []
  )

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement
    const item = t.closest('[data-floor-item]') as HTMLElement | null
    if (!item) {
      setSelected(null)
      return
    }
    e.stopPropagation()
    const type = item.dataset.floorType as 'table' | 'landmark'
    const id = item.dataset.floorId!
    const target: DragTarget = { type, id }
    setSelected(target)

    const { col, row } = cellFromPointer(e.clientX, e.clientY)
    let offsetCol = 0
    let offsetRow = 0
    if (type === 'table') {
      const table = draft.tables.find((x) => x.id === id)
      if (table) {
        const rect = tableRect(table)
        offsetCol = col - rect.grid_x
        offsetRow = row - rect.grid_y
      }
    } else {
      const landmark = draft.landmarks.find((x) => x.id === id)
      if (landmark) {
        offsetCol = col - landmark.grid_x
        offsetRow = row - landmark.grid_y
      }
    }

    setDragging({ mode: 'move', target, offsetCol, offsetRow })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const { col, row } = cellFromPointer(e.clientX, e.clientY)
    if (dragging.mode === 'line-end') {
      moveLineEndpoint(dragging.landmarkId, dragging.endpoint, col, row)
      return
    }
    moveTarget(dragging.target, col, row, dragging.offsetCol, dragging.offsetRow)
  }

  const onLineHandlePointerDown = (
    e: React.PointerEvent,
    landmarkId: string,
    endpoint: 'start' | 'end'
  ) => {
    e.stopPropagation()
    setSelected({ type: 'landmark', id: landmarkId })
    setDragging({ mode: 'line-end', landmarkId, endpoint })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onLineHandlePointerMove = (
    e: React.PointerEvent,
    landmarkId: string
  ) => {
    if (dragging?.mode !== 'line-end' || dragging.landmarkId !== landmarkId) return
    const { col, row } = cellFromPointer(e.clientX, e.clientY)
    moveLineEndpoint(dragging.landmarkId, dragging.endpoint, col, row)
  }

  const endDrag = (e: React.PointerEvent) => {
    if (dragging) {
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    setDragging(null)
  }

  const releaseDragFromHandle = (e: React.PointerEvent) => {
    if (dragging?.mode === 'line-end') {
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      setDragging(null)
    }
  }

  const updateSelectedTable = (patch: Partial<FloorGridRect>) => {
    if (!selectedTable) return
    const units = resolveTableGridUnits(selectedTable.capacity, selectedTable)
    const rect = normalizeFloorRect(
      {
        grid_x: selectedTable.grid_x,
        grid_y: selectedTable.grid_y,
        width_units: selectedTable.width_units,
        height_units: selectedTable.height_units,
        ...patch,
      },
      { w: units.width_units, h: units.height_units }
    )
    setDraft((prev) => ({
      ...prev,
      tables: prev.tables.map((t) => (t.id === selectedTable.id ? patchTableRect(t, rect) : t)),
    }))
  }

  const updateSelectedLandmark = (patch: Partial<VenueLandmarkRow>) => {
    if (!selectedLandmark) return
    const rect = selectedLandmark.is_line
      ? normalizeLandmarkLineRect({ ...selectedLandmark, ...patch })
      : normalizeFloorRect({ ...selectedLandmark, ...patch }, FLOOR_DEFAULT_LANDMARK_SPAN)
    setDraft((prev) => ({
      ...prev,
      landmarks: prev.landmarks.map((l) =>
        l.id === selectedLandmark.id
          ? {
              ...l,
              ...patch,
              ...rect,
              label: patch.label !== undefined ? patch.label : l.label,
            }
          : l
      ),
    }))
  }

  const addLandmark = () => {
    const tempId = `new-${Date.now()}`
    const sort_order = draft.landmarks.length
    const rect = normalizeFloorRect(
      { grid_x: 2, grid_y: 2, width_units: 2, height_units: 2 },
      FLOOR_DEFAULT_LANDMARK_SPAN
    )
    const row: VenueLandmarkRow = {
      id: tempId,
      label: 'New landmark',
      kind: 'other',
      shape: 'rectangle',
      color: VENUE_LANDMARK_COLOR_PRESETS[1] ?? '#f4f4f5',
      sort_order,
      rotation: 0,
      is_line: false,
      ...rect,
    }
    setDraft((prev) => ({ ...prev, landmarks: [...prev.landmarks, row] }))
    setSelected({ type: 'landmark', id: tempId })
  }

  const removeLandmark = async (id: string) => {
    if (id.startsWith('new-')) {
      setDraft((prev) => ({
        ...prev,
        landmarks: prev.landmarks.filter((l) => l.id !== id),
      }))
      if (selected?.type === 'landmark' && selected.id === id) setSelected(null)
      return
    }
    try {
      await deleteVenueLandmark(id)
      setDraft((prev) => ({
        ...prev,
        landmarks: prev.landmarks.filter((l) => l.id !== id),
      }))
      setSaved((prev) => ({
        ...prev,
        landmarks: prev.landmarks.filter((l) => l.id !== id),
      }))
      if (selected?.type === 'landmark' && selected.id === id) setSelected(null)
      setBanner('Landmark deleted.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete landmark.')
    }
  }

  const applyAutoPlace = () => {
    setDraft((prev) => ({
      ...prev,
      tables: autoPlaceTables(prev.tables),
    }))
    setBanner('Unplaced tables arranged by team lanes.')
  }

  const saveAll = async () => {
    setSaving(true)
    setError(null)
    setBanner(null)
    try {
      const tableUpdates = draft.tables.map((t) => {
        const rect = tableRect(t)
        return {
          id: t.id,
          grid_x: rect.grid_x,
          grid_y: rect.grid_y,
          width_units: rect.width_units,
          height_units: rect.height_units,
        }
      })

      await saveFloorLayoutTables(tableUpdates)

      const savedLandmarks: VenueLandmarkRow[] = []
      for (const lm of draft.landmarks) {
        const savedLm = await upsertVenueLandmark({
          id: lm.id.startsWith('new-') ? undefined : lm.id,
          label: lm.label,
          kind: lm.kind || 'other',
          grid_x: lm.grid_x,
          grid_y: lm.grid_y,
          width_units: lm.width_units,
          height_units: lm.height_units,
          shape: lm.shape,
          color: lm.color,
          sort_order:
            typeof lm.sort_order === 'number' && Number.isFinite(lm.sort_order)
              ? Math.trunc(lm.sort_order)
              : 0,
          rotation: normalizeLandmarkRotation(lm.rotation),
          is_line: Boolean(lm.is_line),
        })
        savedLandmarks.push(savedLm)
      }

      const removedIds = saved.landmarks
        .map((l) => l.id)
        .filter((id) => !draft.landmarks.some((l) => l.id === id))
      await Promise.all(removedIds.map((id) => deleteVenueLandmark(id)))

      const next = { tables: draft.tables, landmarks: savedLandmarks }
      setDraft(next)
      setSaved(next)
      setBanner('Floor plan saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save floor plan.')
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    setDraft(saved)
    setSelected(null)
    setBanner(null)
  }

  return (
    <AdminPageShell
      title="Floor plan"
      intro="Drag tables and landmarks on the grid. Changes sync to the guest seating map after you save."
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving || !isDirty}
              onClick={() => void saveAll()}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save layout'}
            </button>
            <button
              type="button"
              disabled={!isDirty}
              onClick={discard}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-40"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={applyAutoPlace}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700"
            >
              Auto-place tables
            </button>
            {stackedTables.length > 1 ? (
              <span className="text-xs text-amber-700">
                {stackedTables.length} tables share the default origin — use Auto-place or drag to spread them out
              </span>
            ) : null}
          </div>

          {error ? (
            <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          ) : null}
          {banner ? (
            <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {banner}
            </p>
          ) : null}

          {loading ? (
            <p className="text-sm text-zinc-500">Loading floor plan…</p>
          ) : (
            <div
              ref={canvasRef}
              className="relative aspect-[4/3] w-full max-w-5xl touch-none select-none overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50"
              style={{
                backgroundImage: `
                  linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)
                `,
                backgroundSize: `${100 / FLOOR_GRID_COLS}% ${100 / FLOOR_GRID_ROWS}%`,
              }}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {draft.landmarks.map((lm) => {
                const isSel = selected?.type === 'landmark' && selected.id === lm.id
                if (lm.is_line) {
                  const { x1, y1, x2, y2 } = landmarkLineEndpoints(lm)
                  const stroke = lm.color ?? '#3b82f6'
                  return (
                    <svg
                      key={lm.id}
                      data-floor-item
                      data-floor-type="landmark"
                      data-floor-id={lm.id}
                      className={`absolute inset-0 z-[8] h-full w-full cursor-grab overflow-visible active:cursor-grabbing ${
                        isSel ? 'z-20' : ''
                      }`}
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={stroke}
                        strokeWidth={isSel ? 4 : 3}
                        strokeDasharray="6 6"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="transparent"
                        strokeWidth={12}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      {isSel ? (
                        <>
                          <circle
                            cx={x1}
                            cy={y1}
                            r={1.2}
                            fill="#ffffff"
                            stroke="#3b82f6"
                            strokeWidth={0.35}
                            vectorEffect="non-scaling-stroke"
                            className="cursor-crosshair"
                            onPointerDown={(ev) => onLineHandlePointerDown(ev, lm.id, 'start')}
                            onPointerMove={(ev) => onLineHandlePointerMove(ev, lm.id)}
                            onPointerUp={releaseDragFromHandle}
                            onPointerCancel={releaseDragFromHandle}
                          />
                          <circle
                            cx={x2}
                            cy={y2}
                            r={1.2}
                            fill="#ffffff"
                            stroke="#3b82f6"
                            strokeWidth={0.35}
                            vectorEffect="non-scaling-stroke"
                            className="cursor-crosshair"
                            onPointerDown={(ev) => onLineHandlePointerDown(ev, lm.id, 'end')}
                            onPointerMove={(ev) => onLineHandlePointerMove(ev, lm.id)}
                            onPointerUp={releaseDragFromHandle}
                            onPointerCancel={releaseDragFromHandle}
                          />
                        </>
                      ) : null}
                    </svg>
                  )
                }
                const labelStyle = landmarkLabelStyle(normalizeLandmarkRotation(lm.rotation))
                return (
                  <div
                    key={lm.id}
                    data-floor-item
                    data-floor-type="landmark"
                    data-floor-id={lm.id}
                    className={`absolute box-border cursor-grab overflow-hidden border px-1 text-center text-[10px] font-medium active:cursor-grabbing ${
                      isSel
                        ? 'z-20 border-violet-400 text-violet-900 ring-2 ring-violet-300'
                        : 'z-10 border-zinc-300 text-zinc-600 shadow-sm'
                    }`}
                    style={{
                      left: `${(lm.grid_x / FLOOR_GRID_COLS) * 100}%`,
                      top: `${(lm.grid_y / FLOOR_GRID_ROWS) * 100}%`,
                      width: `${(lm.width_units / FLOOR_GRID_COLS) * 100}%`,
                      height: `${(lm.height_units / FLOOR_GRID_ROWS) * 100}%`,
                      backgroundColor: lm.color ?? '#ffffff',
                      borderRadius: landmarkBorderRadius(lm.shape),
                    }}
                  >
                    <span
                      className="flex h-full w-full items-center justify-center line-clamp-2 leading-tight"
                      style={labelStyle}
                    >
                      {lm.label}
                    </span>
                  </div>
                )
              })}

              {activeTables.map((t) => {
                const rect = tableRect(t)
                const isSel = selected?.type === 'table' && selected.id === t.id
                return (
                  <div
                    key={t.id}
                    data-floor-item
                    data-floor-type="table"
                    data-floor-id={t.id}
                    className={`absolute box-border cursor-grab overflow-visible rounded-xl border px-1 active:cursor-grabbing ${
                      isSel
                        ? 'z-30 border-zinc-900 bg-zinc-900 text-white ring-2 ring-violet-400'
                        : 'z-[15] border-zinc-300 bg-white text-zinc-900 shadow-md'
                    }`}
                    style={{
                      left: `${(rect.grid_x / FLOOR_GRID_COLS) * 100}%`,
                      top: `${(rect.grid_y / FLOOR_GRID_ROWS) * 100}%`,
                      width: `${(rect.width_units / FLOOR_GRID_COLS) * 100}%`,
                      height: `${(rect.height_units / FLOOR_GRID_ROWS) * 100}%`,
                      ...(t.color && !isSel ? { borderColor: t.color, boxShadow: `0 4px 14px ${t.color}33` } : {}),
                    }}
                  >
                    <div className="flex h-full w-full flex-col items-center justify-center">
                      <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight">
                        {t.name}
                      </span>
                      <span className={`text-[9px] ${isSel ? 'text-zinc-300' : 'text-zinc-500'}`}>
                        {t.capacity} seats
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <aside className="w-full shrink-0 space-y-4 lg:w-80">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">Venue landmarks</h2>
              <button
                type="button"
                onClick={addLandmark}
                className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Add
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Bar, toilets, stage, balcony, lifts, and other fixed features.
            </p>
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
              {draft.landmarks.map((lm) => (
                <li key={lm.id}>
                  <button
                    type="button"
                    onClick={() => setSelected({ type: 'landmark', id: lm.id })}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm ${
                      selected?.type === 'landmark' && selected.id === lm.id
                        ? 'bg-violet-50 text-violet-900'
                        : 'text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <span className="truncate">{lm.label}</span>
                    <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-zinc-400">
                      {lm.kind}
                    </span>
                  </button>
                </li>
              ))}
              {draft.landmarks.length === 0 ? (
                <li className="px-2 py-2 text-xs text-zinc-500">No landmarks yet.</li>
              ) : null}
            </ul>
          </section>

          {selectedLandmark ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-zinc-900">Edit landmark</h2>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-zinc-500">Label</span>
                  <input
                    value={selectedLandmark.label}
                    onChange={(e) => updateSelectedLandmark({ label: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-zinc-500">Type</span>
                  <select
                    value={selectedLandmark.kind}
                    onChange={(e) => updateSelectedLandmark({ kind: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  >
                    {VENUE_LANDMARK_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-zinc-500">Shape</span>
                  <select
                    value={selectedLandmark.shape}
                    onChange={(e) =>
                      updateSelectedLandmark({ shape: normalizeLandmarkShape(e.target.value) })
                    }
                    disabled={selectedLandmark.is_line}
                    className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm disabled:opacity-50"
                  >
                    {VENUE_LANDMARK_SHAPES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedLandmark.is_line}
                    onChange={(e) => {
                      const is_line = e.target.checked
                      updateSelectedLandmark({
                        is_line,
                        ...(is_line
                          ? {
                              color: selectedLandmark.color ?? '#3b82f6',
                              width_units:
                                selectedLandmark.width_units === 0
                                  ? 4
                                  : selectedLandmark.width_units,
                              height_units:
                                selectedLandmark.height_units === 0
                                  ? 4
                                  : selectedLandmark.height_units,
                            }
                          : {}),
                      })
                    }}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  <span className="text-[11px] font-medium text-zinc-600">
                    Boundary line (drag endpoints for any angle)
                  </span>
                </label>
                {!selectedLandmark.is_line ? (
                  <label className="block">
                    <span className="text-[11px] font-medium text-zinc-500">Label rotation</span>
                    <select
                      value={selectedLandmark.rotation}
                      onChange={(e) =>
                        updateSelectedLandmark({
                          rotation: normalizeLandmarkRotation(Number(e.target.value)),
                        })
                      }
                      className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                    >
                      {VENUE_LANDMARK_ROTATIONS.map((deg) => (
                        <option key={deg} value={deg}>
                          {deg}°
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div>
                  <span className="text-[11px] font-medium text-zinc-500">Background color</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {VENUE_LANDMARK_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        aria-label={`Color ${preset}`}
                        onClick={() => updateSelectedLandmark({ color: preset })}
                        className={`h-7 w-7 rounded-full border ${
                          selectedLandmark.color === preset
                            ? 'border-violet-500 ring-2 ring-violet-300'
                            : 'border-zinc-300'
                        }`}
                        style={{ backgroundColor: preset }}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={selectedLandmark.color ?? '#f4f4f5'}
                    onChange={(e) => updateSelectedLandmark({ color: e.target.value })}
                    className="mt-2 h-9 w-full cursor-pointer rounded-lg border border-zinc-200 bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <GridNumberInput
                    label="X"
                    value={selectedLandmark.grid_x}
                    min={0}
                    max={FLOOR_GRID_COLS - 1}
                    onChange={(v) =>
                      updateSelectedLandmark({
                        grid_x: clampGridCoord(v, selectedLandmark.width_units, FLOOR_GRID_COLS),
                      })
                    }
                  />
                  <GridNumberInput
                    label="Y"
                    value={selectedLandmark.grid_y}
                    min={0}
                    max={FLOOR_GRID_ROWS - 1}
                    onChange={(v) =>
                      updateSelectedLandmark({
                        grid_y: clampGridCoord(v, selectedLandmark.height_units, FLOOR_GRID_ROWS),
                      })
                    }
                  />
                  <GridNumberInput
                    label={selectedLandmark.is_line ? 'End ΔX' : 'Width'}
                    value={selectedLandmark.width_units}
                    min={selectedLandmark.is_line ? -FLOOR_GRID_COLS : 1}
                    max={FLOOR_GRID_COLS}
                    onChange={(v) =>
                      updateSelectedLandmark({
                        width_units: selectedLandmark.is_line
                          ? v
                          : clampGridSpan(v, 1, FLOOR_GRID_COLS),
                      })
                    }
                  />
                  <GridNumberInput
                    label={selectedLandmark.is_line ? 'End ΔY' : 'Height'}
                    value={selectedLandmark.height_units}
                    min={selectedLandmark.is_line ? -FLOOR_GRID_ROWS : 1}
                    max={FLOOR_GRID_ROWS}
                    onChange={(v) =>
                      updateSelectedLandmark({
                        height_units: selectedLandmark.is_line
                          ? v
                          : clampGridSpan(v, 1, FLOOR_GRID_ROWS),
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void removeLandmark(selectedLandmark.id)}
                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                >
                  Delete landmark
                </button>
              </div>
            </section>
          ) : null}

          {selectedTable ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-zinc-900">Edit table</h2>
              <p className="mt-1 text-sm text-zinc-600">{selectedTable.name}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <GridNumberInput
                  label="X"
                  value={selectedTable.grid_x}
                  min={0}
                  max={FLOOR_GRID_COLS - 1}
                  onChange={(v) =>
                    updateSelectedTable({
                      grid_x: clampGridCoord(v, selectedTable.width_units, FLOOR_GRID_COLS),
                    })
                  }
                />
                <GridNumberInput
                  label="Y"
                  value={selectedTable.grid_y}
                  min={0}
                  max={FLOOR_GRID_ROWS - 1}
                  onChange={(v) =>
                    updateSelectedTable({
                      grid_y: clampGridCoord(v, selectedTable.height_units, FLOOR_GRID_ROWS),
                    })
                  }
                />
                <GridNumberInput
                  label="Width"
                  value={selectedTable.width_units}
                  min={1}
                  max={FLOOR_GRID_COLS}
                  onChange={(v) =>
                    updateSelectedTable({
                      width_units: clampGridSpan(v, 1, FLOOR_GRID_COLS),
                    })
                  }
                />
                <GridNumberInput
                  label="Height"
                  value={selectedTable.height_units}
                  min={1}
                  max={FLOOR_GRID_ROWS}
                  onChange={(v) =>
                    updateSelectedTable({
                      height_units: clampGridSpan(v, 1, FLOOR_GRID_ROWS),
                    })
                  }
                />
              </div>
            </section>
          ) : null}

          {!selected ? (
            <p className="text-xs text-zinc-500">
              Click a table or landmark on the canvas to edit position and size.
            </p>
          ) : null}
        </aside>
      </div>
    </AdminPageShell>
  )
}
