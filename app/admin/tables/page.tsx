'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  archiveTable,
  createTable,
  listTablesForAdmin,
  permanentlyDeleteTable,
  restoreTable,
  updateTable,
  type AdminTableRow,
} from '@/lib/admin-tables'
import {
  pageConfigJsonFromAdminForm,
  teamPageAdminFormDefaults,
  type TeamPageAdminFormValues,
} from '@/lib/team-page-config'
import { compressAvatarSquareImage, compressImage, isAcceptedImageFile } from '@/lib/image-compress'
import { removeTeamHeroImageByPublicUrl, uploadTeamHeroImage } from '@/lib/team-hero-image-assets'

type EditorMode = 'create' | 'edit'

type ThemePreset = {
  id: 'violet' | 'ocean' | 'rose' | 'forest'
  name: string
  primaryColor: string
  tableGradTop: string
  tableGradBottom: string
  lbGradTop: string
  lbGradBottom: string
  heroTop: string
  heroMiddle: string
  heroBottom: string
}

const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'violet',
    name: 'Violet',
    primaryColor: '#6335fb',
    tableGradTop: '#6d28d9',
    tableGradBottom: '#8b5cf6',
    lbGradTop: '#6d28d9',
    lbGradBottom: '#8b5cf6',
    heroTop: '#5b21b6',
    heroMiddle: '#7c3aed',
    heroBottom: '#fafafa',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    primaryColor: '#1ca0d8',
    tableGradTop: '#0ea5e9',
    tableGradBottom: '#2563eb',
    lbGradTop: '#0ea5e9',
    lbGradBottom: '#2563eb',
    heroTop: '#0369a1',
    heroMiddle: '#0ea5e9',
    heroBottom: '#ecfeff',
  },
  {
    id: 'rose',
    name: 'Rose',
    primaryColor: '#db2777',
    tableGradTop: '#e11d48',
    tableGradBottom: '#f43f5e',
    lbGradTop: '#e11d48',
    lbGradBottom: '#f43f5e',
    heroTop: '#be123c',
    heroMiddle: '#f43f5e',
    heroBottom: '#fff1f2',
  },
  {
    id: 'forest',
    name: 'Forest',
    primaryColor: '#059669',
    tableGradTop: '#059669',
    tableGradBottom: '#16a34a',
    lbGradTop: '#059669',
    lbGradBottom: '#16a34a',
    heroTop: '#065f46',
    heroMiddle: '#10b981',
    heroBottom: '#f0fdf4',
  },
]

const GRADIENT_CTA =
  'bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] text-white border-transparent'

function initialsFromName(name: string): string {
  const t = name.trim()
  if (!t) return 'T'
  return t
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')
}

function avatarFallbackColor(seed: string): string {
  const colors = ['#f59e0b', '#3b82f6', '#8b5cf6', '#14b8a6', '#ef4444', '#22c55e']
  let n = 0
  for (let i = 0; i < seed.length; i += 1) n += seed.charCodeAt(i)
  return colors[n % colors.length] ?? '#71717a'
}

function ColorCircleField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(value.trim()) ? value.trim() : '#64748b'
  return (
    <label className="block text-xs">
      <span className="font-medium text-zinc-600">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <span
          className="relative h-7 w-7 shrink-0 rounded-full border border-zinc-300"
          style={{ backgroundColor: safe }}
        >
          <input
            type="color"
            value={safe}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={label}
          />
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 flex-1 rounded-full border border-zinc-300 bg-white px-3 text-xs"
        />
      </div>
    </label>
  )
}

function PreviewPhone({ form, name }: { form: TeamPageAdminFormValues; name: string }) {
  const heroBg = form.heroMiddle.trim()
    ? `linear-gradient(to bottom, ${form.heroTop}, ${form.heroMiddle}, ${form.heroBottom})`
    : `linear-gradient(to bottom, ${form.heroTop}, ${form.heroBottom})`
  const avatarUrl = form.avatarImageUrl.trim()
  const initials = initialsFromName(name)
  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-[28px] bg-white">
      <div className="h-full overflow-y-auto">
        <div className="p-0 text-white" style={{ background: heroBg }}>
          <div className="px-3 pb-3 pt-3">
            {form.heroImageUrl.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.heroImageUrl.trim()}
                alt=""
                className="mx-auto mb-2 h-16 w-[82%] rounded-md object-contain"
              />
            ) : null}
            <div className="text-center text-[13px] font-semibold">{name || 'Table name'}</div>
            <div className="mx-auto mt-1 line-clamp-2 w-[90%] text-center text-[10px] font-medium opacity-95">
              {form.teamText.trim() || 'Team description preview'}
            </div>
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                className="rounded-full px-3 py-1 text-[10px] font-semibold text-white"
                style={{ backgroundColor: form.primaryColor || '#6335fb' }}
              >
                Earn more coins
              </button>
            </div>
          </div>
        </div>
        <div className="mt-3 px-3">
          <div
            className="rounded-xl px-2.5 py-2 text-white"
            style={{
              background: `linear-gradient(to right, ${form.lbGradTop || '#17a3d6'}, ${form.lbGradBottom || '#5f32f3'})`,
            }}
          >
            <div className="flex items-center justify-between text-[10px]">
              <span className="inline-flex items-center gap-2">
                <span className="h-6 w-6 overflow-hidden rounded-full ring-1 ring-white/40">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span
                      className="flex h-full w-full items-center justify-center text-[9px] font-semibold text-white"
                      style={{ backgroundColor: avatarFallbackColor(name) }}
                    >
                      {initials}
                    </span>
                  )}
                </span>
                <span className="font-medium">{name || 'Your table'}</span>
              </span>
              <span className="font-semibold">245</span>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-2.5 py-2">
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="inline-flex items-center gap-2 text-zinc-700">
                <span className="h-5 w-5 overflow-hidden rounded-full border border-zinc-200">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span
                      className="flex h-full w-full items-center justify-center text-[8px] font-semibold text-white"
                      style={{ backgroundColor: avatarFallbackColor(name) }}
                    >
                      {initials}
                    </span>
                  )}
                </span>
                <span>{name || 'Your table'} made a move</span>
              </span>
              <span className="font-semibold text-zinc-900">+15</span>
            </div>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[52%] bg-gradient-to-b from-transparent via-white/85 to-white" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-white/95" />
      <div className="pointer-events-none absolute inset-0 rounded-[28px] border border-zinc-200 [mask-image:linear-gradient(to_bottom,black_0%,black_60%,transparent_100%)]" />
    </div>
  ) 
}

export default function TablesAdminPage() {
  const [rows, setRows] = useState<AdminTableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [mode, setMode] = useState<EditorMode>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formName, setFormName] = useState('')
  const [formCapacity, setFormCapacity] = useState(10)
  const [formActive, setFormActive] = useState(true)
  const [formPresetId, setFormPresetId] = useState<ThemePreset['id']>('violet')
  const [formTheme, setFormTheme] = useState<TeamPageAdminFormValues>(() =>
    teamPageAdminFormDefaults(null, { tableColor: '#6335fb', tableName: 'New Table' })
  )
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [heroUploading, setHeroUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const heroInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!successToast) return
    const t = window.setTimeout(() => setSuccessToast(null), 2200)
    return () => window.clearTimeout(t)
  }, [successToast])

  const activeRows = useMemo(() => rows.filter((r) => !r.is_archived), [rows])
  const archivedRows = useMemo(() => rows.filter((r) => r.is_archived), [rows])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listTablesForAdmin()
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tables.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function applyPreset(presetId: ThemePreset['id']) {
    const p = THEME_PRESETS.find((x) => x.id === presetId) ?? THEME_PRESETS[0]
    if (!p) return
    setFormPresetId(p.id)
    setFormTheme((prev) => ({
      ...prev,
      primaryColor: p.primaryColor,
      tableGradTop: p.tableGradTop,
      tableGradBottom: p.tableGradBottom,
      lbGradTop: p.lbGradTop,
      lbGradBottom: p.lbGradBottom,
      heroTop: p.heroTop,
      heroMiddle: p.heroMiddle,
      heroBottom: p.heroBottom,
    }))
  }

  function openCreateEditor() {
    setMode('create')
    setEditingId(null)
    setFormName('')
    setFormCapacity(10)
    setFormActive(true)
    setFormPresetId('violet')
    const d = teamPageAdminFormDefaults(null, {
      tableColor: '#6335fb',
      tableName: 'New Table',
    })
    setFormTheme({ ...d, avatarImageUrl: '' })
    setEditorOpen(true)
    setError(null)
  }

  function openEditEditor(row: AdminTableRow) {
    setMode('edit')
    setEditingId(row.id)
    setFormName(row.name)
    setFormCapacity(row.capacity || 10)
    setFormActive(row.is_active)
    const d = teamPageAdminFormDefaults(row.page_config, {
      tableColor: row.color,
      tableName: row.name,
    })
    setFormTheme({ ...d, avatarImageUrl: d.avatarImageUrl ?? '' })
    setEditorOpen(true)
    setError(null)
  }

  async function uploadAvatar(file: File) {
    if (!isAcceptedImageFile(file)) {
      setError('Use JPG, PNG, or WEBP.')
      return
    }
    setAvatarUploading(true)
    try {
      const previous = formTheme.avatarImageUrl.trim() || null
      const { blob } = await compressAvatarSquareImage(file)
      const uploadFile = new File([blob], 'table-avatar.webp', { type: 'image/webp' })
      const url = await uploadTeamHeroImage(uploadFile, `${formName || 'table'}-avatar`)
      setFormTheme((prev) => ({ ...prev, avatarImageUrl: url }))
      await removeTeamHeroImageByPublicUrl(previous)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Avatar upload failed.')
    } finally {
      setAvatarUploading(false)
    }
  }

  async function uploadHero(file: File) {
    if (!isAcceptedImageFile(file)) {
      setError('Use JPG, PNG, or WEBP.')
      return
    }
    setHeroUploading(true)
    try {
      const previous = formTheme.heroImageUrl.trim() || null
      const { blob, contentType } = await compressImage(file)
      const ext = contentType.split('/')[1] ?? 'jpg'
      const uploadFile = new File([blob], `hero.${ext}`, { type: contentType })
      const url = await uploadTeamHeroImage(uploadFile, formName || 'table')
      setFormTheme((prev) => ({ ...prev, heroImageUrl: url }))
      await removeTeamHeroImageByPublicUrl(previous)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hero image upload failed.')
    } finally {
      setHeroUploading(false)
    }
  }

  async function saveEditor() {
    const name = formName.trim()
    if (!name) {
      setError('Table name is required.')
      return
    }
    setSaving(true)
    setError(null)
    setSuccessToast(null)
    try {
      const pageConfig = pageConfigJsonFromAdminForm({
        ...formTheme,
        teamText: formTheme.teamText.trim(),
      })
      if (mode === 'create') {
        await createTable({
          name,
          capacity: formCapacity,
          color: formTheme.primaryColor,
          is_active: formActive,
        })
        const refreshed = await listTablesForAdmin()
        const created = refreshed.find((r) => r.name.trim() === name)
        if (created) {
          await updateTable(created.id, { page_config: pageConfig })
        }
        setRows(await listTablesForAdmin())
        setSuccessToast('Table created.')
      } else if (editingId) {
        await updateTable(editingId, {
          name,
          capacity: formCapacity,
          color: formTheme.primaryColor,
          is_active: formActive,
          page_config: pageConfig,
        })
        await load()
        setSuccessToast('Table updated.')
      }
      setEditorOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function onArchive(id: string) {
    if (!window.confirm('Archive this table?')) return
    setError(null)
    try {
      await archiveTable(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archive failed.')
    }
  }

  async function onRestore(id: string) {
    setError(null)
    try {
      await restoreTable(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed.')
    }
  }

  async function onDeleteForever(id: string) {
    const typed = window.prompt('Type DELETE to permanently remove this table:')
    if ((typed ?? '').trim().toUpperCase() !== 'DELETE') return
    setError(null)
    try {
      await permanentlyDeleteTable(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
    }
  }

  return (
    <div className="admin-page-shell">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="admin-page-title text-zinc-900">Tables</h1>
          <p className="admin-gap-page-title-intro admin-intro">
            Create and edit teams/tables. Names must be unique.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateEditor}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm ${GRADIENT_CTA}`}
        >
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>+</span>
            <span>Create new table</span>
          </span>
        </button>
      </header>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      <section className="admin-gap-intro-first-section">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading tables...</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeRows.map((row) => {
              const resolved = teamPageAdminFormDefaults(row.page_config, {
                tableColor: row.color,
                tableName: row.name,
              })
              const avatarUrl = resolved.avatarImageUrl.trim()
              const isActiveStatus = row.is_active && !row.is_archived
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => openEditEditor(row)}
                  className="group relative h-[290px] cursor-pointer overflow-hidden rounded-2xl border border-zinc-200 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm"
                  style={{
                    background: `linear-gradient(to bottom, ${resolved.heroTop}, ${resolved.heroMiddle || resolved.heroBottom}, ${resolved.heroBottom})`,
                  }}
                >
                  <div className="relative flex h-full flex-col justify-between p-3 text-white">
                    {resolved.heroImageUrl.trim() ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolved.heroImageUrl.trim()}
                        alt=""
                        className="absolute inset-x-3 top-6 h-36 w-[calc(100%-1.5rem)] object-contain opacity-95"
                      />
                    ) : null}
                    <div className="flex items-start justify-between gap-2">
                      <span className="h-9 w-9 overflow-hidden rounded-full ring-1 ring-white/55">
                        {avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span
                            className="flex h-full w-full items-center justify-center text-[11px] font-semibold"
                            style={{ backgroundColor: avatarFallbackColor(row.name) }}
                          >
                            {initialsFromName(row.name)}
                          </span>
                        )}
                      </span>
                      <span className="rounded-full bg-black/20 p-1.5 text-white/90 transition-colors group-hover:bg-black/30">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                          aria-hidden
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </span>
                    </div>
                    <div>
                      <p className="mt-24 text-center text-base font-semibold">{row.name}</p>
                    </div>
                    <div
                      className="rounded-xl px-3 py-2 text-[11px] font-medium"
                      style={{ backgroundColor: resolved.primaryColor || '#6335fb' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>Seats {row.capacity}</span>
                        <span className="inline-flex items-center gap-1">
                          {isActiveStatus ? (
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3.5 w-3.5"
                              aria-hidden
                            >
                              <path d="m5 12 5 5L20 7" />
                            </svg>
                          ) : null}
                          {isActiveStatus ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="admin-card-title text-zinc-900">Archived tables</h2>
        <div className="admin-gap-card-title-body space-y-2">
          {archivedRows.length === 0 ? (
            <p className="text-sm text-zinc-500">No archived tables.</p>
          ) : (
            archivedRows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{row.name}</p>
                  <p className="text-xs text-zinc-500">Archived</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onRestore(row.id)}
                    className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteForever(row.id)}
                    className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700"
                  >
                    Delete forever
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {editorOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditorOpen(false)
          }}
        >
          <div className="flex max-h-[88vh] w-full max-w-[1004px] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm animate-[fadeIn_180ms_ease-out]">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">
                  {mode === 'create' ? 'Create new table' : 'Edit table'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black text-white"
                aria-label="Close editor"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-hidden px-5 py-4 [&_input]:!text-[14px] [&_textarea]:!text-[14px] [&_select]:!text-[14px]">
              <div className="grid h-full gap-6 lg:grid-cols-[minmax(0,1fr)_308px]">
                <div className="h-full overflow-y-auto pr-2">
                  <div className="space-y-6">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null
                        e.currentTarget.value = ''
                        if (file) void uploadAvatar(file)
                      }}
                    />
                    <input
                      ref={heroInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null
                        e.currentTarget.value = ''
                        if (file) void uploadHero(file)
                      }}
                    />

                    <section className="space-y-4 pb-5 border-b border-zinc-200/80">
                      <h4 className="text-sm font-semibold text-zinc-900">Identity</h4>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => heroInputRef.current?.click()}
                          disabled={heroUploading}
                          className="group relative h-[116px] w-full overflow-hidden rounded-2xl border border-zinc-300/80 bg-zinc-50 transition-colors hover:border-zinc-400 disabled:opacity-60"
                          aria-label="Edit hero image"
                        >
                          {formTheme.heroImageUrl.trim() ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={formTheme.heroImageUrl.trim()}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-sm font-medium text-white opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                                Replace cover
                              </span>
                            </>
                          ) : (
                            <span className="absolute inset-0 grid place-items-center text-sm text-zinc-400">
                              Add cover image
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={avatarUploading}
                          className="group absolute -bottom-7 left-4 h-[72px] w-[72px] overflow-hidden rounded-full border-2 border-white bg-zinc-100 shadow-sm transition-transform hover:scale-[1.02] disabled:opacity-60"
                          aria-label="Edit avatar"
                        >
                          {formTheme.avatarImageUrl.trim() ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={formTheme.avatarImageUrl.trim()}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                              <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="h-4 w-4"
                                  aria-hidden
                                >
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                              </span>
                            </>
                          ) : (
                            <span className="grid h-full w-full place-items-center text-zinc-500">
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.8}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-5 w-5"
                                aria-hidden
                              >
                                <path d="M12 5v14M5 12h14" />
                              </svg>
                            </span>
                          )}
                        </button>
                      </div>

                      <div className="pt-8 space-y-4">
                        <label className="block">
                          <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600">
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3.5 w-3.5"
                              aria-hidden
                            >
                              <rect x="3" y="5" width="18" height="14" rx="2" />
                              <path d="M8 9h8M8 13h5" />
                            </svg>
                            Table name
                          </span>
                          <input
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            className="h-9 w-full border-b border-zinc-300 bg-transparent px-1 text-[14px] outline-none focus:border-zinc-500"
                            placeholder="Enter team name"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600">
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3.5 w-3.5"
                              aria-hidden
                            >
                              <path d="M4 6h16M4 12h10M4 18h13" />
                            </svg>
                            Tagline
                          </span>
                          <input
                            value={formTheme.teamText}
                            onChange={(e) => setFormTheme((p) => ({ ...p, teamText: e.target.value }))}
                            className="h-9 w-full border-b border-zinc-300 bg-transparent px-1 text-[14px] outline-none focus:border-zinc-500"
                            placeholder="A short line for the team"
                          />
                        </label>
                      </div>
                    </section>

                    <section className="space-y-4 pb-5 border-b border-zinc-200/80">
                      <h4 className="text-sm font-semibold text-zinc-900">Theme</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          {THEME_PRESETS.map((preset) => {
                            const selected = formPresetId === preset.id
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => applyPreset(preset.id)}
                                className={`relative h-9 w-9 rounded-full transition-all ${
                                  selected ? 'ring-2 ring-zinc-900 ring-offset-2' : 'ring-1 ring-zinc-200'
                                }`}
                                style={{
                                  background: `linear-gradient(to right, ${preset.tableGradTop}, ${preset.tableGradBottom})`,
                                }}
                                aria-label={`Theme ${preset.name}`}
                              >
                                {selected ? (
                                  <span className="absolute inset-0 flex items-center justify-center text-white">
                                    <svg
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={2.5}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="h-4 w-4"
                                      aria-hidden
                                    >
                                      <path d="m5 12 5 5L20 7" />
                                    </svg>
                                  </span>
                                ) : null}
                              </button>
                            )
                          })}
                        </div>
                        <div className="grid grid-cols-4 gap-3 text-[11px] text-zinc-500">
                          {THEME_PRESETS.map((preset) => (
                            <span key={`${preset.id}-label`} className="text-center truncate">
                              {preset.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <ColorCircleField
                          label="Hero top"
                          value={formTheme.heroTop}
                          onChange={(v) => setFormTheme((p) => ({ ...p, heroTop: v }))}
                        />
                        <ColorCircleField
                          label="Hero middle"
                          value={formTheme.heroMiddle}
                          onChange={(v) => setFormTheme((p) => ({ ...p, heroMiddle: v }))}
                        />
                        <ColorCircleField
                          label="Hero bottom"
                          value={formTheme.heroBottom}
                          onChange={(v) => setFormTheme((p) => ({ ...p, heroBottom: v }))}
                        />
                        <ColorCircleField
                          label="Primary CTA"
                          value={formTheme.primaryColor}
                          onChange={(v) => setFormTheme((p) => ({ ...p, primaryColor: v }))}
                        />
                        <ColorCircleField
                          label="Leaderboard top"
                          value={formTheme.lbGradTop}
                          onChange={(v) => setFormTheme((p) => ({ ...p, lbGradTop: v }))}
                        />
                        <ColorCircleField
                          label="Leaderboard bottom"
                          value={formTheme.lbGradBottom}
                          onChange={(v) => setFormTheme((p) => ({ ...p, lbGradBottom: v }))}
                        />
                      </div>
                    </section>

                    <section className="space-y-3">
                      <h4 className="text-sm font-semibold text-zinc-900">Compact settings</h4>
                      <div className="flex items-end gap-4">
                        <label className="block">
                          <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600">
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3.5 w-3.5"
                              aria-hidden
                            >
                              <path d="M5 19v-5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5" />
                              <path d="M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                            </svg>
                            Seat capacity
                          </span>
                          <input
                            type="number"
                            min={1}
                            value={formCapacity}
                            onChange={(e) => setFormCapacity(Math.max(1, Number(e.target.value) || 1))}
                            className="h-9 w-28 border-b border-zinc-300 bg-transparent px-1 text-[14px] outline-none focus:border-zinc-500"
                          />
                        </label>
                        <label className="inline-flex items-center gap-2 px-1 py-1.5 text-sm font-medium text-zinc-700">
                          <span
                            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                              formActive ? 'bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)]' : 'bg-zinc-300'
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                                formActive ? 'translate-x-4.5' : 'translate-x-0.5'
                              }`}
                            />
                          </span>
                          <input
                            type="checkbox"
                            checked={formActive}
                            onChange={(e) => setFormActive(e.target.checked)}
                            className="sr-only"
                          />
                          Make active
                        </label>
                      </div>
                    </section>
                  </div>
                </div>

                <div className="self-start">
                  <div className="mb-1 text-xs font-medium text-zinc-600">Preview</div>
                  <PreviewPhone form={formTheme} name={formName || 'New table'} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-5 py-3">
              <div className="flex items-center gap-2">
                {mode === 'edit' && editingId ? (
                  <button
                    type="button"
                    onClick={() => void onArchive(editingId)}
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700"
                  >
                    Archive table
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveEditor()}
                  className={`rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 ${GRADIENT_CTA}`}
                >
                  {saving ? 'Saving...' : 'Finalize'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {successToast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm animate-[fadeIn_180ms_ease-out]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden
            >
              <path d="m5 12 5 5L20 7" />
            </svg>
            <span>{successToast}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

