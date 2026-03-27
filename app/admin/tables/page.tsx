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
type OverlayStep = 1 | 2 | 3
type ThemeColorKey = 'heroTop' | 'heroMiddle' | 'heroBottom' | 'lbGradTop' | 'lbGradBottom' | 'primaryColor'

const NAME_SUGGESTION_CHIPS = ['Power Rangers', 'Turtle Table', 'VIP Legends', 'Chaos Crew'] as const

type ThemePreset = {
  id: 'violet' | 'ocean' | 'rose' | 'forest'
  name: string
  character: string
  primaryColor: string
  accent: string
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
    character: 'Bold / expressive / vibrant',
    primaryColor: '#6d28ff',
    accent: '#f59e0b',
    tableGradTop: '#5f24f5',
    tableGradBottom: '#9f6bff',
    lbGradTop: '#5921de',
    lbGradBottom: '#7f44f6',
    heroTop: '#3f167c',
    heroMiddle: '#6c2cff',
    heroBottom: '#f7f2ff',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    character: 'Clean / modern / productized',
    primaryColor: '#0d8fd6',
    accent: '#38bdf8',
    tableGradTop: '#0b8dcb',
    tableGradBottom: '#2b67dc',
    lbGradTop: '#0a7fb5',
    lbGradBottom: '#1e5fd0',
    heroTop: '#0a4f78',
    heroMiddle: '#0d8fd6',
    heroBottom: '#eef7ff',
  },
  {
    id: 'rose',
    name: 'Rose',
    character: 'Warm / social / celebratory',
    primaryColor: '#e44b7a',
    accent: '#fb7185',
    tableGradTop: '#d93868',
    tableGradBottom: '#f26a8f',
    lbGradTop: '#cf2f5d',
    lbGradBottom: '#ea5f86',
    heroTop: '#9f294f',
    heroMiddle: '#e14b79',
    heroBottom: '#fff4f6',
  },
  {
    id: 'forest',
    name: 'Forest',
    character: 'Grounded / premium / calm',
    primaryColor: '#0d8b65',
    accent: '#84cc16',
    tableGradTop: '#0a7a58',
    tableGradBottom: '#2fa06d',
    lbGradTop: '#0d6f52',
    lbGradBottom: '#26895f',
    heroTop: '#0f3f30',
    heroMiddle: '#1d8c62',
    heroBottom: '#f3fbf7',
  },
]

const GRADIENT_CTA =
  'bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] text-white border-transparent'

const FOOTER_BTN_SECONDARY =
  'rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-all duration-200 ease-out hover:bg-zinc-50'

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
            <div className="relative mx-auto mb-2 flex h-[5.25rem] w-[82%] items-center justify-center overflow-hidden rounded-lg ring-1 ring-white/25">
              {!form.heroImageUrl.trim() ? (
                <div
                  className="absolute inset-0 opacity-[0.55]"
                  style={{
                    background: `linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 45%, rgba(0,0,0,0.12) 100%)`,
                  }}
                />
              ) : null}
              {!form.heroImageUrl.trim() ? (
                <div
                  className="absolute inset-0 opacity-[0.35]"
                  style={{
                    backgroundImage: `repeating-linear-gradient(-18deg, rgba(255,255,255,0.07) 0 2px, transparent 2px 5px)`,
                  }}
                />
              ) : null}
              {form.heroImageUrl.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.heroImageUrl.trim()}
                  alt=""
                  className="relative z-[1] max-h-[5.25rem] w-full object-contain"
                />
              ) : null}
            </div>
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
  const [editorClosing, setEditorClosing] = useState(false)
  const [mode, setMode] = useState<EditorMode>('create')
  const [overlayStep, setOverlayStep] = useState<OverlayStep>(1)
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
  const [openColorField, setOpenColorField] = useState<ThemeColorKey | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [step1Hint, setStep1Hint] = useState<string | null>(null)
  const [overlayError, setOverlayError] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const heroInputRef = useRef<HTMLInputElement | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const overlayCloseTimerRef = useRef<number | null>(null)
  const overlayTriggerRef = useRef<HTMLButtonElement | null>(null)

  const closeOverlay = useCallback(() => {
    if (!editorOpen || editorClosing) return
    setPublishOpen(false)
    setStep1Hint(null)
    setOverlayError(null)
    setEditorClosing(true)
    if (overlayCloseTimerRef.current !== null) {
      window.clearTimeout(overlayCloseTimerRef.current)
    }
    overlayCloseTimerRef.current = window.setTimeout(() => {
      setEditorOpen(false)
      setEditorClosing(false)
      if (overlayTriggerRef.current) {
        overlayTriggerRef.current.blur()
        overlayTriggerRef.current = null
      }
      overlayCloseTimerRef.current = null
    }, 200)
  }, [editorOpen, editorClosing])

  useEffect(() => {
    if (!successToast) return
    const t = window.setTimeout(() => setSuccessToast(null), 2200)
    return () => window.clearTimeout(t)
  }, [successToast])

  useEffect(() => {
    if (!editorOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (publishOpen) {
        setPublishOpen(false)
        return
      }
      closeOverlay()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [editorOpen, closeOverlay, publishOpen])

  useEffect(() => {
    return () => {
      if (overlayCloseTimerRef.current !== null) {
        window.clearTimeout(overlayCloseTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!editorOpen || overlayStep !== 1) return
    const t = window.setTimeout(() => {
      nameInputRef.current?.focus()
    }, 40)
    return () => window.clearTimeout(t)
  }, [editorOpen, overlayStep])

  useEffect(() => {
    setOpenColorField(null)
  }, [overlayStep])

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
    setOverlayStep(1)
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
    overlayTriggerRef.current = null
    setEditorClosing(false)
    setEditorOpen(true)
    setError(null)
    setStep1Hint(null)
    setOverlayError(null)
  }

  function openEditEditor(
    row: AdminTableRow,
    triggerEl?: HTMLButtonElement | null
  ) {
    setMode('edit')
    setOverlayStep(1)
    setEditingId(row.id)
    setFormName(row.name)
    setFormCapacity(row.capacity || 10)
    setFormActive(row.is_active)
    const d = teamPageAdminFormDefaults(row.page_config, {
      tableColor: row.color,
      tableName: row.name,
    })
    setFormTheme({ ...d, avatarImageUrl: d.avatarImageUrl ?? '' })
    overlayTriggerRef.current = triggerEl ?? null
    setEditorClosing(false)
    setEditorOpen(true)
    setError(null)
    setStep1Hint(null)
    setOverlayError(null)
  }

  function setColorField(key: ThemeColorKey, next: string) {
    setFormTheme((prev) => ({ ...prev, [key]: next }))
  }

  const advanceFromStep1 = useCallback(() => {
    const n = formName.trim()
    if (!n) {
      setStep1Hint("Let's choose a name first")
      return
    }
    setStep1Hint(null)
    setOverlayStep(2)
  }, [formName])

  const openPublishFlow = useCallback(() => {
    setOverlayError(null)
    setPublishOpen(true)
  }, [])

  const closePublish = useCallback(() => {
    setPublishOpen(false)
  }, [])

  async function uploadAvatar(file: File) {
    if (!isAcceptedImageFile(file)) {
      setOverlayError('Use JPG, PNG, or WEBP.')
      return
    }
    setOverlayError(null)
    setAvatarUploading(true)
    try {
      const previous = formTheme.avatarImageUrl.trim() || null
      const { blob } = await compressAvatarSquareImage(file)
      const uploadFile = new File([blob], 'table-avatar.webp', { type: 'image/webp' })
      const url = await uploadTeamHeroImage(uploadFile, `${formName || 'table'}-avatar`)
      setFormTheme((prev) => ({ ...prev, avatarImageUrl: url }))
      await removeTeamHeroImageByPublicUrl(previous)
    } catch (e) {
      setOverlayError(e instanceof Error ? e.message : 'Avatar upload failed.')
    } finally {
      setAvatarUploading(false)
    }
  }

  async function uploadHero(file: File) {
    if (!isAcceptedImageFile(file)) {
      setOverlayError('Use JPG, PNG, or WEBP.')
      return
    }
    setOverlayError(null)
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
      setOverlayError(e instanceof Error ? e.message : 'Hero image upload failed.')
    } finally {
      setHeroUploading(false)
    }
  }

  async function saveEditor() {
    const name = formName.trim()
    if (!name) {
      setOverlayError("Let's choose a name first")
      return
    }
    setSaving(true)
    setOverlayError(null)
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
      setPublishOpen(false)
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

      {error && !editorOpen && !editorClosing ? (
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
                  onClick={(e) => openEditEditor(row, e.currentTarget)}
                  className="group relative h-[290px] cursor-pointer overflow-hidden rounded-2xl border border-zinc-200 text-left outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/70 focus-visible:ring-offset-2"
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

      {editorOpen || editorClosing ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ease-out ${
            editorClosing ? 'bg-zinc-900/0 opacity-0' : 'bg-zinc-900/30 opacity-100'
          }`}
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return
            if (publishOpen) closePublish()
            else closeOverlay()
          }}
        >
          <div
            className={`relative z-10 flex h-[90vh] max-h-[900px] w-full max-w-[1080px] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm transition-all duration-200 ease-out ${
              editorClosing ? 'translate-y-2 scale-[0.98] opacity-0' : 'translate-y-0 scale-100 opacity-100'
            }`}
          >
            {publishOpen ? (
              <div
                className="pointer-events-none absolute inset-0 z-[55] rounded-3xl bg-black/25 transition-opacity duration-200 ease-out"
                aria-hidden
              />
            ) : null}
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">
                  {mode === 'create' ? 'Create new table' : 'Edit table'}
                </h3>
                <div className="mt-1 inline-flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-8 rounded-full transition-colors duration-200 ${
                      overlayStep === 1 ? 'bg-zinc-900' : 'bg-zinc-200'
                    }`}
                  />
                  <span
                    className={`h-1.5 w-8 rounded-full transition-colors duration-200 ${
                      overlayStep >= 2 ? 'bg-zinc-900' : 'bg-zinc-200'
                    }`}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={closeOverlay}
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

            {overlayError ? (
              <div className="border-b border-zinc-200/80 bg-zinc-50/90 px-5 py-2.5 text-sm text-zinc-700">
                {overlayError}
              </div>
            ) : null}

            <div className="relative flex min-h-0 flex-1 flex-col overflow-x-visible overflow-y-hidden">
              <div className="min-h-0 flex-1 overflow-x-visible overflow-y-auto overscroll-contain px-5 py-4 pb-28 [&_input]:!text-[14px] [&_textarea]:!text-[14px] [&_select]:!text-[14px]">
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
              <div className="relative min-h-full w-full overflow-x-visible">
              <div
                className={`absolute inset-0 transition-all duration-200 ease-out ${
                  overlayStep === 1
                    ? 'translate-x-0 opacity-100'
                    : '-translate-x-3 pointer-events-none opacity-0'
                }`}
              >
                <div className="flex min-h-full items-center justify-center py-2">
                  <div className="w-full max-w-[736px] space-y-5 overflow-x-visible px-0.5">
                    <h4 className="text-center text-3xl font-semibold tracking-tight text-zinc-900">
                      What are we calling this table?
                    </h4>
                    <div className="rounded-2xl bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] p-[1px] shadow-[0_0_0_1px_rgba(91,56,242,0.08),0_0_28px_rgba(28,160,216,0.18)]">
                      <div
                        className={`flex h-14 items-center gap-2 rounded-2xl bg-white pl-4 pr-2 transition-[box-shadow] duration-200 ease-out ${
                          step1Hint ? 'shadow-[inset_0_0_0_1px_rgba(248,113,113,0.55)]' : ''
                        }`}
                      >
                        <input
                          ref={nameInputRef}
                          value={formName}
                          onChange={(e) => {
                            setFormName(e.target.value)
                            setStep1Hint(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              advanceFromStep1()
                            }
                          }}
                          className="min-w-0 flex-1 bg-transparent !text-[16px] outline-none"
                          placeholder="What’s your table name?"
                        />
                        <button
                          type="button"
                          onClick={advanceFromStep1}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-white shadow-sm transition-all hover:scale-[1.04] hover:shadow-md active:scale-[0.96]"
                          aria-label="Continue"
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
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {step1Hint ? (
                      <p className="px-1 text-center text-sm font-medium leading-snug text-zinc-600">{step1Hint}</p>
                    ) : null}
                    <div className="flex flex-wrap justify-center gap-2">
                      {NAME_SUGGESTION_CHIPS.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => {
                            setFormName(chip)
                            setStep1Hint(null)
                            setOverlayError(null)
                            setOverlayStep(2)
                          }}
                          className="rounded-full border border-zinc-200/90 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition-all duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-50 hover:shadow"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={`absolute inset-0 flex flex-col overflow-x-visible overflow-y-visible transition-all duration-200 ease-out ${
                  overlayStep >= 2
                    ? 'translate-x-0 opacity-100'
                    : 'pointer-events-none translate-x-3 opacity-0'
                }`}
              >
                <div className="flex min-h-0 flex-1 flex-col py-3">
                  <div className="mx-auto flex h-full min-h-0 w-full max-w-[736px] flex-1 flex-col overflow-x-visible">
                    <div className="relative h-[min(260px,30vh)] min-h-[220px] w-full shrink-0 sm:h-[min(280px,32vh)] sm:min-h-[240px]">
                      <div
                        className={`absolute inset-0 overflow-y-auto overflow-x-visible transition-all duration-200 ease-out ${
                          overlayStep === 2
                            ? 'z-10 translate-x-0 opacity-100'
                            : 'pointer-events-none z-0 -translate-x-2 opacity-0'
                        }`}
                      >
                        <div className="flex flex-col items-center space-y-4 pb-2 pt-1">
                          <h4 className="text-center text-2xl font-semibold tracking-tight text-zinc-900">
                            What’s the team identity?
                          </h4>
                          <div className="w-full rounded-2xl bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] p-[1px] shadow-[0_0_0_1px_rgba(91,56,242,0.08),0_0_28px_rgba(28,160,216,0.18)]">
                            <label className="flex h-12 items-center rounded-2xl bg-white px-4">
                              <input
                                value={formTheme.teamText}
                                onChange={(e) => setFormTheme((p) => ({ ...p, teamText: e.target.value }))}
                                className="w-full bg-transparent !text-[15px] outline-none"
                                placeholder="Add a short tagline"
                              />
                            </label>
                          </div>
                          <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              onClick={() => avatarInputRef.current?.click()}
                              disabled={avatarUploading}
                              className="group relative flex h-12 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50/90 text-sm font-medium text-zinc-800 transition-all duration-200 ease-out hover:border-transparent hover:bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] hover:text-white disabled:opacity-60"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.7}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="relative z-10 h-4 w-4 text-zinc-500 transition-colors duration-200 ease-out group-hover:text-white"
                                aria-hidden
                              >
                                <circle cx="12" cy="8" r="3.5" />
                                <path d="M5 20a7 7 0 0 1 14 0" />
                              </svg>
                              <span className="relative z-10 transition-colors duration-200 ease-out group-hover:text-white">
                                Avatar
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => heroInputRef.current?.click()}
                              disabled={heroUploading}
                              className="group relative flex h-12 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50/90 text-sm font-medium text-zinc-800 transition-all duration-200 ease-out hover:border-transparent hover:bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] hover:text-white disabled:opacity-60"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.7}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="relative z-10 h-4 w-4 text-zinc-500 transition-colors duration-200 ease-out group-hover:text-white"
                                aria-hidden
                              >
                                <rect x="3" y="5" width="18" height="14" rx="2" />
                                <circle cx="8.5" cy="10" r="1.2" />
                                <path d="m21 15-6-5-4 4-3-3-5 5" />
                              </svg>
                              <span className="relative z-10 transition-colors duration-200 ease-out group-hover:text-white">
                                Hero
                              </span>
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-3">
                            <div className="flex items-center gap-2.5">
                              {THEME_PRESETS.map((preset) => {
                                const selected = formPresetId === preset.id
                                return (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => applyPreset(preset.id)}
                                    aria-label={`Theme preset ${preset.name}`}
                                    className={`h-10 w-10 rounded-full transition-all duration-200 hover:brightness-105 ${
                                      selected
                                        ? 'ring-2 ring-zinc-900/50 ring-offset-2'
                                        : 'ring-1 ring-zinc-200/90'
                                    }`}
                                    style={{
                                      background: `linear-gradient(145deg, ${preset.tableGradTop}, ${preset.tableGradBottom})`,
                                    }}
                                  />
                                )
                              })}
                            </div>
                            <button
                              type="button"
                              onClick={() => setOverlayStep(3)}
                              className={`inline-flex items-center gap-2 ${FOOTER_BTN_SECONDARY} text-zinc-600`}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.8}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4 text-zinc-500"
                                aria-hidden
                              >
                                <path d="M12 2 9.8 7.2 4.5 9.5l5.3 2.3L12 17l2.2-5.2 5.3-2.3-5.3-2.3L12 2Z" />
                              </svg>
                              Customize
                            </button>
                          </div>
                        </div>
                      </div>
                      <div
                        className={`absolute inset-0 overflow-y-auto overflow-x-visible transition-all duration-200 ease-out ${
                          overlayStep === 3
                            ? 'z-10 translate-x-0 opacity-100'
                            : 'pointer-events-none z-0 translate-x-2 opacity-0'
                        }`}
                      >
                        <div className="flex flex-col items-center space-y-4 pb-2 pt-1">
                          <div className="relative w-full max-w-md">
                            <button
                              type="button"
                              onClick={() => setOverlayStep(2)}
                              className="absolute left-0 top-0.5 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-sm transition-transform duration-200 ease-out hover:scale-105 active:scale-95"
                              aria-label="Back to team identity"
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
                                <path d="M19 12H5M12 19l-7-7 7-7" />
                              </svg>
                            </button>
                            <h4 className="px-11 text-center text-2xl font-semibold tracking-tight text-zinc-900">
                              How should we color it?
                            </h4>
                          </div>
                          <div className="flex justify-center gap-3">
                            {THEME_PRESETS.map((preset) => {
                              const selected = formPresetId === preset.id
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => applyPreset(preset.id)}
                                  aria-label={`Theme preset ${preset.name}`}
                                  className={`h-11 w-11 rounded-full transition-all duration-200 hover:brightness-105 ${
                                    selected
                                      ? 'ring-2 ring-zinc-900/55 ring-offset-[3px]'
                                      : 'ring-1 ring-zinc-200/90'
                                  }`}
                                  style={{
                                    background: `linear-gradient(145deg, ${preset.tableGradTop}, ${preset.tableGradBottom})`,
                                  }}
                                />
                              )
                            })}
                          </div>
                          <div className="w-full space-y-3 rounded-2xl border border-zinc-100/90 bg-zinc-50/50 p-3">
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { key: 'heroTop' as const, label: 'Top' },
                                { key: 'heroMiddle' as const, label: 'Mid' },
                                { key: 'heroBottom' as const, label: 'Bot' },
                              ].map(({ key, label }) => {
                                const value = formTheme[key]
                                return (
                                  <div key={key} className="relative flex flex-col items-center">
                                    <button
                                      type="button"
                                      onClick={() => setOpenColorField((prev) => (prev === key ? null : key))}
                                      className="h-9 w-9 rounded-full border border-white/80 shadow-sm ring-1 ring-zinc-200/80"
                                      style={{ backgroundColor: value }}
                                      aria-label={`Hero ${label} color`}
                                    />
                                    {openColorField === key ? (
                                      <div className="absolute left-1/2 top-full z-30 mt-1 w-36 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-2 shadow-md">
                                        <input
                                          type="color"
                                          value={value}
                                          onChange={(e) => setColorField(key, e.target.value)}
                                          className="h-7 w-full cursor-pointer rounded border-0"
                                        />
                                        <input
                                          value={value}
                                          onChange={(e) => setColorField(key, e.target.value)}
                                          className="mt-1.5 w-full rounded border border-zinc-100 px-1.5 py-1 text-[10px] text-zinc-600"
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                            <div className="grid grid-cols-2 gap-3 border-t border-zinc-100/80 pt-3">
                              {[
                                { key: 'lbGradTop' as const, label: 'Top' },
                                { key: 'lbGradBottom' as const, label: 'Bot' },
                              ].map(({ key, label }) => {
                                const value = formTheme[key]
                                return (
                                  <div key={key} className="relative flex flex-col items-center">
                                    <button
                                      type="button"
                                      onClick={() => setOpenColorField((prev) => (prev === key ? null : key))}
                                      className="h-9 w-9 rounded-full border border-white/80 shadow-sm ring-1 ring-zinc-200/80"
                                      style={{ backgroundColor: value }}
                                      aria-label={`Leaderboard ${label} color`}
                                    />
                                    {openColorField === key ? (
                                      <div className="absolute left-1/2 top-full z-30 mt-1 w-36 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-2 shadow-md">
                                        <input
                                          type="color"
                                          value={value}
                                          onChange={(e) => setColorField(key, e.target.value)}
                                          className="h-7 w-full cursor-pointer rounded border-0"
                                        />
                                        <input
                                          value={value}
                                          onChange={(e) => setColorField(key, e.target.value)}
                                          className="mt-1.5 w-full rounded border border-zinc-100 px-1.5 py-1 text-[10px] text-zinc-600"
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                            <div className="flex justify-center border-t border-zinc-100/80 pt-3">
                              <div className="relative flex flex-col items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenColorField((prev) => (prev === 'primaryColor' ? null : 'primaryColor'))
                                  }
                                  className="h-9 w-9 rounded-full border border-white/80 shadow-sm ring-1 ring-zinc-200/80"
                                  style={{ backgroundColor: formTheme.primaryColor }}
                                  aria-label="Primary CTA color"
                                />
                                {openColorField === 'primaryColor' ? (
                                  <div className="absolute left-1/2 top-full z-30 mt-1 w-36 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-2 shadow-md">
                                    <input
                                      type="color"
                                      value={formTheme.primaryColor}
                                      onChange={(e) => setColorField('primaryColor', e.target.value)}
                                      className="h-7 w-full cursor-pointer rounded border-0"
                                    />
                                    <input
                                      value={formTheme.primaryColor}
                                      onChange={(e) => setColorField('primaryColor', e.target.value)}
                                      className="mt-1.5 w-full rounded border border-zinc-100 px-1.5 py-1 text-[10px] text-zinc-600"
                                    />
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex w-full shrink-0 justify-center overflow-visible px-2 pb-4 pt-8">
                      <div className="relative w-full max-w-[340px] overflow-visible rounded-[28px] border border-zinc-200/90 shadow-sm">
                        <div className="relative overflow-visible pt-1">
                          <div className="origin-top scale-[1.06] transition-transform duration-200 ease-out">
                            <PreviewPhone form={formTheme} name={formName || 'New table'} />
                          </div>
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[48%] bg-gradient-to-b from-transparent via-white/78 to-white" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-[76px] z-30 h-12 bg-gradient-to-t from-white via-white/85 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-2 border-t border-zinc-100/90 bg-white/[0.98] px-5 pb-5 pt-3.5 supports-[backdrop-filter]:backdrop-blur-sm">
              <div className="flex items-center gap-2">
                {mode === 'edit' && editingId && (overlayStep === 2 || overlayStep === 3) ? (
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
                  onClick={() => {
                    if (overlayStep === 1) closeOverlay()
                    else if (overlayStep === 3) setOverlayStep(2)
                    else setOverlayStep(1)
                  }}
                  className={FOOTER_BTN_SECONDARY}
                >
                  Back
                </button>
                {overlayStep === 1 ? (
                  <button
                    type="button"
                    onClick={advanceFromStep1}
                    className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={openPublishFlow}
                    className={`rounded-full px-5 py-2 text-sm font-semibold transition-opacity duration-200 ease-out disabled:opacity-60 ${GRADIENT_CTA}`}
                  >
                    Finalize
                  </button>
                )}
              </div>
            </div>

          {publishOpen ? (
            <div
              className="absolute inset-0 z-[60] flex items-center justify-center px-4"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closePublish()
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="publish-table-title"
                className="w-full max-w-[380px] rounded-2xl bg-white p-7 shadow-xl animate-[adminPublishPop_0.2s_ease-out_both]"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <h2 id="publish-table-title" className="text-center text-lg font-semibold tracking-tight text-zinc-900">
                  Ready to publish?
                </h2>
                <div className="mt-6 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-3 sm:flex-nowrap">
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={formCapacity}
                      onChange={(e) => setFormCapacity(Math.max(1, Number(e.target.value) || 1))}
                      className="w-14 shrink-0 rounded-lg border-0 border-b border-zinc-200 bg-transparent py-1 text-center text-sm font-medium text-zinc-900 outline-none transition-colors duration-200 ease-out focus:border-zinc-400"
                      aria-label="Seat capacity"
                    />
                    <span className="text-sm font-medium text-zinc-700">seats</span>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-700">
                    <span
                      className={`relative inline-flex h-5 w-9 rounded-full transition-colors duration-200 ease-out ${
                        formActive ? 'bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)]' : 'bg-zinc-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-200 ease-out ${
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
                    Active
                  </label>
                </div>
                <div className="mt-8 flex items-center justify-center gap-3">
                  <button type="button" onClick={closePublish} className={FOOTER_BTN_SECONDARY}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveEditor()}
                    className={`rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 ${GRADIENT_CTA}`}
                  >
                    {saving ? 'Publishing…' : 'Publish'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
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

