'use client'

import { useCallback, useEffect, useState } from 'react'
import { listAttendeesForAdmin } from '@/lib/admin-attendees'
import { loadGuestFloorLayout } from '@/lib/admin-floor-layout'
import { listTablesForAdmin } from '@/lib/admin-tables'
import { gridRectToPercentBounds } from '@/lib/floor-layout'
import { resolveTeamId } from '@/lib/table-teams'
import {
  SeatMap,
  SEAT_MAP_ZOOM_CATERING,
  type SeatMapGuest,
  type SeatMapLandmark,
} from '@/components/SeatMap'

export default function AdminCateringMapPage() {
  const [guests, setGuests] = useState<SeatMapGuest[]>([])
  const [tables, setTables] = useState<
    {
      id: string
      name: string
      color: string | null
      capacity: number
      display_order: number
      page_config: unknown
      team_id: string
      grid_x: number | null
      grid_y: number | null
      width_units: number
      height_units: number
    }[]
  >([])
  const [landmarks, setLandmarks] = useState<SeatMapLandmark[]>([])
  const [layoutSchemaReady, setLayoutSchemaReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setError(null)
    try {
      const [attendeeRows, tableRows, floorLayout] = await Promise.all([
        listAttendeesForAdmin(),
        listTablesForAdmin(),
        loadGuestFloorLayout().catch(() => null),
      ])

      const activeTables = tableRows.filter((t) => !t.is_archived && t.is_active)
      const tableById = new Map(activeTables.map((t) => [t.id, t]))
      const floorTableById = new Map((floorLayout?.tables ?? []).map((t) => [t.id, t]))

      const seatedGuests: SeatMapGuest[] = attendeeRows
        .filter(
          (r) =>
            r.table_id != null &&
            r.seat_number != null &&
            Number.isFinite(r.seat_number) &&
            tableById.has(r.table_id)
        )
        .map((r) => ({
          id: r.id,
          full_name: r.full_name,
          photo_url: r.photo_url,
          table_id: r.table_id as string,
          seat_number: Math.trunc(r.seat_number as number),
          dietary_restrictions: r.dietary_restrictions,
          needs_baby_chair: r.needs_baby_chair,
          needs_kids_menu: r.needs_kids_menu,
          no_meal: r.no_meal,
        }))

      setGuests(seatedGuests)
      setTables(
        activeTables.map((t) => {
          const floor = floorTableById.get(t.id)
          return {
            id: t.id,
            name: t.name,
            color: t.color,
            capacity: t.capacity,
            display_order: t.display_order,
            page_config: t.page_config,
            team_id: resolveTeamId({ id: t.id, team_id: t.team_id }),
            grid_x: floor?.grid_x ?? null,
            grid_y: floor?.grid_y ?? null,
            width_units: floor?.width_units ?? 4,
            height_units: floor?.height_units ?? 3,
          }
        })
      )

      if (floorLayout) {
        setLayoutSchemaReady(floorLayout.layoutSchemaReady)
        setLandmarks(
          (floorLayout.landmarks ?? []).map((lm) => {
            const bounds = gridRectToPercentBounds(lm)
            return {
              id: lm.id,
              name: lm.label,
              shape: lm.shape,
              color: lm.color,
              rotation: lm.rotation,
              is_line: lm.is_line,
              grid_x: lm.grid_x,
              grid_y: lm.grid_y,
              width_units: lm.width_units,
              height_units: lm.height_units,
              ...bounds,
            }
          })
        )
      } else {
        setLayoutSchemaReady(false)
        setLandmarks([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load catering map.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  return (
    <div className="admin-page-shell flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0">
        <h1 className="admin-page-title text-zinc-900">Catering map</h1>
        <p className="admin-gap-page-title-intro admin-intro">
          Internal floor view for allergies, baby chairs, kids menus, and no-meal guests across seated guests.
        </p>
      </header>

      {error ? (
        <p className="admin-gap-page-title-intro mt-2 shrink-0 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <section className="admin-gap-intro-first-section flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#ebebeb] bg-white">
        <div className="flex min-h-0 flex-1 flex-col p-4">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading catering map…</p>
          ) : tables.length === 0 ? (
            <p className="text-sm text-zinc-500">No active tables to display.</p>
          ) : (
            <SeatMap
              logisticsCallouts
              defaultZoom={SEAT_MAP_ZOOM_CATERING}
              tables={tables}
              guests={guests}
              landmarks={landmarks}
              layoutSchemaReady={layoutSchemaReady}
              className="min-h-0 flex-1 !aspect-auto !h-full"
            />
          )}
        </div>
      </section>
    </div>
  )
}
