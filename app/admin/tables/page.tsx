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
    <label className="block">
      <span className="admin-field-label text-zinc-600">{label}</span>
      <div className="admin-gap-label-input flex items-center gap-2">
        <input
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded-full border border-zinc-300 bg-transparent p-0"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 flex-1 rounded-full border border-zinc-300 bg-white px-3 text-sm"
        />
      </div>
    </label>
  )
}

function PreviewPhone({
  form,
  name,
  step,
}: {
  form: TeamPageAdminFormValues
  name: string
  step: 1 | 2
}) {
  const heroBg = form.heroMiddle.trim()
    ? `linear-gradient(to bottom, ${form.heroTop}, ${form.heroMiddle}, ${form.heroBottom})`
    : `linear-gradient(to bottom, ${form.heroTop}, ${form.heroBottom})`
  const avatarUrl = form.avatarImageUrl.trim()
  const initials = initialsFromName(name)
  return (
    <div className="rounded-3xl border border-zinc-200 bg-zinc-100 p-2">
      <div className="mx-auto h-[430px] w-[220px] overflow-hidden rounded-[26px] border border-zinc-300 bg-white shadow-sm">
        <div className="px-3 pt-3 pb-2 text-[11px] font-semibold text-zinc-700">Preview</div>
        <div className="mx-3 rounded-xl p-3 text-white" style={{ background: heroBg }}>
          <div className="text-xs font-semibold">{name || 'Table name'}</div>
          <div className="mt-1 text-[10px] opacity-90 line-clamp-2">
            {form.teamText.trim() || 'Team description preview'}
          </div>
          {step === 2 && form.heroImageUrl.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.heroImageUrl.trim()}
              alt=""
              className="mt-2 h-16 w-full rounded-lg object-cover"
            />
          ) : null}
          <button
            type="button"
            className="mt-2 rounded-full px-3 py-1 text-[10px] font-semibold text-white"
            style={{ backgroundColor: form.primaryColor || '#6335fb' }}
          >
            Earn more coins
          </button>
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
    </div>
  )
}

export default function TablesAdminPage() {
  const [rows, setRows] = useState<AdminTableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [mode, setMode] = useState<EditorMode>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
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
    setStep(1)
    setShowAdvanced(false)
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
    setStep(1)
    setShowAdvanced(false)
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
    setSuccess(null)
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
        setSuccess('Table created.')
      } else if (editingId) {
        await updateTable(editingId, {
          name,
          capacity: formCapacity,
          color: formTheme.primaryColor,
          is_active: formActive,
          page_config: pageConfig,
        })
        await load()
        setSuccess('Table updated.')
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
      <header>
        <h1 className="admin-page-title text-zinc-900">Tables</h1>
        <p className="admin-gap-page-title-intro admin-intro">
          Create and edit teams/tables. Names must be unique.
        </p>
      </header>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <section className="admin-gap-intro-first-section">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading tables...</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <button
              type="button"
              onClick={openCreateEditor}
              className={`rounded-2xl border p-5 text-left transition-transform duration-200 hover:-translate-y-0.5 ${GRADIENT_CTA}`}
            >
              <div className="text-base font-semibold">Create new table</div>
              <div className="mt-1 text-sm text-white/90">Start with a preset and finalize in 2 steps.</div>
            </button>
            {activeRows.map((row) => {
              const resolved = teamPageAdminFormDefaults(row.page_config, {
                tableColor: row.color,
                tableName: row.name,
              })
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => openEditEditor(row)}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-zinc-900">{row.name}</p>
                      <p className="mt-1 text-sm text-zinc-500">
                        Capacity {row.capacity} · {row.is_active ? 'Active' : 'Inactive'}
                      </p>
                    </div>
                    <span
                      className="h-9 w-9 rounded-full border border-white/70"
                      style={{ backgroundColor: resolved.primaryColor }}
                    />
                  </div>
                  <div className="mt-4 rounded-xl p-3 text-xs text-white" style={{ background: `linear-gradient(to bottom, ${resolved.heroTop}, ${resolved.heroBottom})` }}>
                    <div className="font-medium">{row.name}</div>
                    <div className="mt-1 opacity-90 line-clamp-2">{resolved.teamText}</div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4">
          <div className="w-full max-w-5xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm animate-[fadeIn_180ms_ease-out]">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">
                  {mode === 'create' ? 'Create new table' : 'Edit table'}
                </h3>
                <p className="text-sm text-zinc-500">Step {step} of 2</p>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_250px]">
              <div>
                {step === 1 ? (
                  <div className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-[88px_1fr] sm:items-start">
                      <div>
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
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={avatarUploading}
                          className="h-20 w-20 overflow-hidden rounded-full border border-zinc-300 bg-zinc-50"
                        >
                          {formTheme.avatarImageUrl.trim() ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={formTheme.avatarImageUrl.trim()}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                              Upload
                            </span>
                          )}
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block sm:col-span-2">
                          <span className="admin-field-label text-zinc-600">Table name</span>
                          <input
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            className="admin-gap-label-input h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                            placeholder="e.g. Kaypoh Aunties"
                          />
                        </label>
                        <label className="block">
                          <span className="admin-field-label text-zinc-600">Seat capacity</span>
                          <input
                            type="number"
                            min={1}
                            value={formCapacity}
                            onChange={(e) => setFormCapacity(Math.max(1, Number(e.target.value) || 1))}
                            className="admin-gap-label-input h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                          />
                        </label>
                        <label className="block">
                          <span className="admin-field-label text-zinc-600">Status</span>
                          <select
                            value={formActive ? 'active' : 'inactive'}
                            onChange={(e) => setFormActive(e.target.value === 'active')}
                            className="admin-gap-label-input h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="admin-field-label text-zinc-600">Theme preset</span>
                        <button
                          type="button"
                          onClick={() => setShowAdvanced((v) => !v)}
                          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700"
                        >
                          {showAdvanced ? 'Hide customize' : 'Customize'}
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {THEME_PRESETS.map((preset) => {
                          const selected = formPresetId === preset.id
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => applyPreset(preset.id)}
                              className={`rounded-2xl border p-3 text-left transition-colors ${
                                selected
                                  ? 'border-zinc-900 bg-zinc-50'
                                  : 'border-zinc-200 bg-white hover:border-zinc-300'
                              }`}
                            >
                              <div className="text-sm font-semibold text-zinc-900">{preset.name}</div>
                              <div className="mt-2 h-6 rounded-lg" style={{ background: `linear-gradient(to right, ${preset.tableGradTop}, ${preset.tableGradBottom})` }} />
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {showAdvanced ? (
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <p className="text-sm font-medium text-zinc-800">Advanced customization (table instance only)</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <ColorCircleField
                            label="Primary CTA color"
                            value={formTheme.primaryColor}
                            onChange={(v) => setFormTheme((p) => ({ ...p, primaryColor: v }))}
                          />
                          <ColorCircleField
                            label="Hero gradient top"
                            value={formTheme.heroTop}
                            onChange={(v) => setFormTheme((p) => ({ ...p, heroTop: v }))}
                          />
                          <ColorCircleField
                            label="Hero gradient middle"
                            value={formTheme.heroMiddle}
                            onChange={(v) => setFormTheme((p) => ({ ...p, heroMiddle: v }))}
                          />
                          <ColorCircleField
                            label="Hero gradient bottom"
                            value={formTheme.heroBottom}
                            onChange={(v) => setFormTheme((p) => ({ ...p, heroBottom: v }))}
                          />
                          <ColorCircleField
                            label="Leaderboard gradient top"
                            value={formTheme.lbGradTop}
                            onChange={(v) => setFormTheme((p) => ({ ...p, lbGradTop: v }))}
                          />
                          <ColorCircleField
                            label="Leaderboard gradient bottom"
                            value={formTheme.lbGradBottom}
                            onChange={(v) => setFormTheme((p) => ({ ...p, lbGradBottom: v }))}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <span className="admin-field-label text-zinc-600">Hero image</span>
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
                      <div className="admin-gap-label-input rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        {formTheme.heroImageUrl.trim() ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={formTheme.heroImageUrl.trim()}
                            alt=""
                            className="h-32 w-full rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-sm text-zinc-500">
                            No hero image selected
                          </div>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={heroUploading}
                            onClick={() => heroInputRef.current?.click()}
                            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700"
                          >
                            {heroUploading ? 'Uploading...' : 'Upload / replace'}
                          </button>
                          {formTheme.heroImageUrl.trim() ? (
                            <button
                              type="button"
                              onClick={async () => {
                                const prev = formTheme.heroImageUrl.trim() || null
                                setFormTheme((p) => ({ ...p, heroImageUrl: '' }))
                                try {
                                  await removeTeamHeroImageByPublicUrl(prev)
                                } catch {
                                  // best effort cleanup
                                }
                              }}
                              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <label className="block">
                      <span className="admin-field-label text-zinc-600">Description</span>
                      <textarea
                        rows={4}
                        value={formTheme.teamText}
                        onChange={(e) => setFormTheme((p) => ({ ...p, teamText: e.target.value }))}
                        className="admin-gap-label-input w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                )}
              </div>

              <PreviewPhone form={formTheme} name={formName || 'New table'} step={step} />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-4">
              <div className="flex items-center gap-2">
                {mode === 'edit' && editingId ? (
                  <button
                    type="button"
                    onClick={() => void onArchive(editingId)}
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700"
                  >
                    Archive table
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {step === 2 ? (
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700"
                  >
                    Back
                  </button>
                ) : null}
                {step === 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${GRADIENT_CTA}`}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveEditor()}
                    className={`rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 ${GRADIENT_CTA}`}
                  >
                    {saving ? 'Saving...' : 'Finalize'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

