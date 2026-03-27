'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
type DeleteConfirmState = { id: string; name: string } | null

const NAME_SUGGESTION_CHIPS = ['Power Rangers', 'Turtle Table', 'VIP Legends', 'Chaos Crew'] as const

type ThemePreset = {
  id: 'violet' | 'ocean' | 'rose' | 'forest' | 'amber' | 'slate'
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
  {
    id: 'amber',
    name: 'Amber',
    character: 'Playful / energetic / warm',
    primaryColor: '#f59e0b',
    accent: '#fcd34d',
    tableGradTop: '#d97706',
    tableGradBottom: '#fbbf24',
    lbGradTop: '#f59e0b',
    lbGradBottom: '#fcd34d',
    heroTop: '#f59e0b',
    heroMiddle: '#fbbf24',
    heroBottom: '#fde68a',
  },
  {
    id: 'slate',
    name: 'Slate',
    character: 'Premium / minimal / modern',
    primaryColor: '#111827',
    accent: '#6b7280',
    tableGradTop: '#111827',
    tableGradBottom: '#4b5563',
    lbGradTop: '#1f2937',
    lbGradBottom: '#6b7280',
    heroTop: '#111827',
    heroMiddle: '#374151',
    heroBottom: '#9ca3af',
  },
]

const GRADIENT_CTA =
  'bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] text-white border-transparent'

const FOOTER_BTN_SECONDARY =
  'rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-all duration-200 ease-out hover:bg-zinc-50'

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

function normalizeHex(input: string): string | null {
  const raw = input.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null
  const full = raw.length === 3 ? raw.split('').map((c) => `${c}${c}`).join('') : raw
  return `#${full.toLowerCase()}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex)
  if (!n) return null
  const raw = n.slice(1)
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
  }
  h = Math.round((h * 60 + 360) % 360)
  const s = max === 0 ? 0 : d / max
  const v = max
  return { h, s, v }
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const rgb = hexToRgb(hex)
  if (!rgb) return { h: 0, s: 0, v: 0 }
  return rgbToHsv(rgb.r, rgb.g, rgb.b)
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let rp = 0
  let gp = 0
  let bp = 0
  if (h < 60) [rp, gp, bp] = [c, x, 0]
  else if (h < 120) [rp, gp, bp] = [x, c, 0]
  else if (h < 180) [rp, gp, bp] = [0, c, x]
  else if (h < 240) [rp, gp, bp] = [0, x, c]
  else if (h < 300) [rp, gp, bp] = [x, 0, c]
  else [rp, gp, bp] = [c, 0, x]
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  }
}

function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v)
  return rgbToHex(r, g, b)
}

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
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
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
  const [tableSearch, setTableSearch] = useState('')
  const [tableSort, setTableSort] = useState<'name-asc' | 'name-desc' | 'seats-desc' | 'recent'>('name-asc')
  const [tableStatusFilter, setTableStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [tableView, setTableView] = useState<'cards' | 'list'>('cards')
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null)
  const [colorPopoverPos, setColorPopoverPos] = useState<{ left: number; top: number } | null>(null)
  const [pickerHsv, setPickerHsv] = useState<{ h: number; s: number; v: number }>({ h: 260, s: 0.74, v: 0.98 })
  const [pickerHex, setPickerHex] = useState('#6d28ff')
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const heroInputRef = useRef<HTMLInputElement | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const taglineInputRef = useRef<HTMLInputElement | null>(null)
  const colorPickerRef = useRef<HTMLDivElement | null>(null)
  const svPanelRef = useRef<HTMLDivElement | null>(null)
  const draggingSvRef = useRef(false)
  const overlayCloseTimerRef = useRef<number | null>(null)
  const overlayTriggerRef = useRef<HTMLButtonElement | null>(null)

  const showToast = useCallback((message: string, kind: 'success' | 'error') => {
    setToast({ kind, message })
  }, [])

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
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!editorOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (openColorField) {
        setOpenColorField(null)
        setColorPopoverPos(null)
        return
      }
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
  }, [editorOpen, closeOverlay, publishOpen, openColorField])

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
    if (!editorOpen || overlayStep !== 2) return
    const t = window.setTimeout(() => {
      taglineInputRef.current?.focus()
    }, 40)
    return () => window.clearTimeout(t)
  }, [editorOpen, overlayStep])

  useEffect(() => {
    setOpenColorField(null)
    setColorPopoverPos(null)
  }, [overlayStep])

  useEffect(() => {
    if (!editorOpen) return
    const handleOutsidePointer = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-color-dot="true"]')) return
      if (colorPickerRef.current?.contains(target)) return
      setOpenColorField(null)
      setColorPopoverPos(null)
    }
    window.addEventListener('mousedown', handleOutsidePointer)
    return () => {
      window.removeEventListener('mousedown', handleOutsidePointer)
    }
  }, [editorOpen])

  const activeRows = useMemo(() => rows.filter((r) => !r.is_archived), [rows])
  const archivedRows = useMemo(() => rows.filter((r) => r.is_archived), [rows])
  const visibleActiveRows = useMemo(() => {
    const search = tableSearch.trim().toLowerCase()
    const filtered = activeRows.filter((row) => {
      if (search && !row.name.toLowerCase().includes(search)) return false
      if (tableStatusFilter === 'active' && !row.is_active) return false
      if (tableStatusFilter === 'inactive' && row.is_active) return false
      return true
    })
    const sorted = [...filtered]
    if (tableSort === 'name-asc') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    } else if (tableSort === 'name-desc') {
      sorted.sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: 'base' }))
    } else if (tableSort === 'seats-desc') {
      sorted.sort((a, b) => (b.capacity || 0) - (a.capacity || 0))
    } else {
      sorted.sort((a, b) => {
        const ad = new Date(a.created_at).getTime()
        const bd = new Date(b.created_at).getTime()
        return bd - ad
      })
    }
    return sorted
  }, [activeRows, tableSearch, tableStatusFilter, tableSort])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listTablesForAdmin()
      setRows(list)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load tables.'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

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
    setFormTheme({ ...d, avatarImageUrl: '', teamText: '' })
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

  const updatePickerColor = useCallback(
    (next: { h: number; s: number; v: number }) => {
      if (!openColorField) return
      const bounded = {
        h: clamp(next.h, 0, 360),
        s: clamp(next.s, 0, 1),
        v: clamp(next.v, 0, 1),
      }
      const hex = hsvToHex(bounded.h, bounded.s, bounded.v)
      setPickerHsv(bounded)
      setPickerHex(hex)
      setColorField(openColorField, hex)
    },
    [openColorField]
  )

  const updateSvFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!svPanelRef.current) return
      const rect = svPanelRef.current.getBoundingClientRect()
      const s = clamp((clientX - rect.left) / rect.width, 0, 1)
      const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1)
      updatePickerColor({ h: pickerHsv.h, s, v })
    },
    [pickerHsv.h, updatePickerColor]
  )

  useEffect(() => {
    if (!openColorField) return
    const handleMove = (e: MouseEvent) => {
      if (!draggingSvRef.current) return
      updateSvFromPointer(e.clientX, e.clientY)
    }
    const handleUp = () => {
      draggingSvRef.current = false
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [openColorField, updateSvFromPointer])

  const openColorPicker = useCallback((key: ThemeColorKey, el: HTMLButtonElement) => {
    const rect = el.getBoundingClientRect()
    const popoverWidth = 208
    const edgePadding = 12
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, edgePadding + popoverWidth / 2),
      window.innerWidth - edgePadding - popoverWidth / 2
    )
    const top = Math.min(Math.max(rect.bottom + 10, edgePadding), window.innerHeight - 260)
    const currentHex = normalizeHex(formTheme[key]) ?? '#6d28ff'
    setPickerHex(currentHex)
    setPickerHsv(hexToHsv(currentHex))
    setOpenColorField(key)
    setColorPopoverPos({ left, top })
  }, [formTheme])

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

  const avatarReady = formTheme.avatarImageUrl.trim().length > 0
  const heroReady = formTheme.heroImageUrl.trim().length > 0

  async function saveEditor() {
    const name = formName.trim()
    if (!name) {
      setOverlayError("Let's choose a name first")
      return
    }
    setSaving(true)
    setOverlayError(null)
    setToast(null)
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
        showToast('Table created.', 'success')
      } else if (editingId) {
        await updateTable(editingId, {
          name,
          capacity: formCapacity,
          color: formTheme.primaryColor,
          is_active: formActive,
          page_config: pageConfig,
        })
        await load()
        showToast('Table updated.', 'success')
      }
      setPublishOpen(false)
      setEditorOpen(false)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed.', 'error')
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
      showToast('Table archived.', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Archive failed.', 'error')
    }
  }

  async function onRestore(id: string) {
    setError(null)
    try {
      await restoreTable(id)
      await load()
      showToast('Table restored.', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Restore failed.', 'error')
    }
  }

  async function onDeleteForever(id: string) {
    setError(null)
    try {
      await permanentlyDeleteTable(id)
      setRows((prev) => prev.filter((row) => row.id !== id))
      showToast('Table permanently deleted.', 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed.', 'error')
    }
  }

  return (
    <div className="admin-page-shell">
      <p className="sr-only" aria-live="polite">
        {error ?? ''}
      </p>
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="admin-page-title text-zinc-900">Tables</h1>
          <p className="admin-gap-page-title-intro admin-intro">
            Create and edit teams/tables. Names must be unique.
          </p>
        </div>
      </header>

      <section className="admin-gap-intro-first-section">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative w-full md:w-[360px]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search tables..."
              className="h-10 w-full rounded-[6px] border border-[#ebebeb] bg-white pl-8 pr-[10px] text-[14px] font-normal text-[#171717] placeholder:text-[14px] placeholder:font-normal placeholder:text-[#767676] outline-none transition-colors focus:border-zinc-400 font-[inherit]"
            />
          </div>
          <div className="inline-flex h-10 items-center rounded-[6px] border border-[#ebebeb] bg-white p-1">
            <button
              type="button"
              onClick={() => setTableView('cards')}
              className={`inline-flex h-8 items-center rounded-[6px] px-[10px] text-[14px] font-medium transition-all ${
                tableView === 'cards' ? 'bg-[#f2f2f2] text-[#171717]' : 'text-[#4d4d4d] hover:text-[#171717]'
              }`}
            >
              Cards
            </button>
            <button
              type="button"
              onClick={() => setTableView('list')}
              className={`inline-flex h-8 items-center rounded-[6px] px-[10px] text-[14px] font-medium transition-all ${
                tableView === 'list' ? 'bg-[#f2f2f2] text-[#171717]' : 'text-[#4d4d4d] hover:text-[#171717]'
              }`}
            >
              List
            </button>
          </div>
          <div className="relative">
            <select
              value={tableStatusFilter}
              onChange={(e) => setTableStatusFilter(e.target.value as typeof tableStatusFilter)}
              className="h-10 appearance-none rounded-[6px] border border-[#ebebeb] bg-white px-[10px] pr-9 text-[14px] font-medium text-[#171717] outline-none transition-colors focus:border-zinc-400 font-[inherit]"
            >
              <option value="all">All status</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
          <div className="relative md:ml-auto">
            <select
              value={tableSort}
              onChange={(e) => setTableSort(e.target.value as typeof tableSort)}
              className="h-10 appearance-none rounded-[6px] border border-[#ebebeb] bg-white px-[10px] pr-9 text-[14px] font-medium text-[#171717] outline-none transition-colors focus:border-zinc-400 font-[inherit]"
            >
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="seats-desc">Most seats</option>
              <option value="recent">Recently created</option>
            </select>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
        {loading ? (
          <div
            className={`grid gap-4 ${
              tableView === 'list' ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            }`}
            aria-hidden
          >
            {tableView === 'list' ? (
              <div className="overflow-hidden rounded-[6px] border border-[#ebebeb] bg-[#f2f2f2] p-4">
                <div className="mb-3 h-6 w-44 animate-pulse rounded bg-white/90" />
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-[64px] animate-pulse rounded-[6px] bg-white" />
                  ))}
                </div>
              </div>
            ) : (
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="h-[290px] animate-pulse rounded-2xl border border-zinc-200 bg-white" />
              ))
            )}
          </div>
        ) : tableView === 'list' ? (
          <div className="overflow-hidden rounded-[6px] border border-[#ebebeb] bg-[#f2f2f2]">
            <div className="grid h-[45px] grid-cols-[minmax(280px,1.4fr)_minmax(140px,0.85fr)_110px_120px] items-center gap-3 border-b border-[#ebebeb] px-4 text-sm font-medium text-[#4d4d4d]">
              <span>Table</span>
              <span>Status</span>
              <span>Seats</span>
              <span className="text-right">Actions</span>
            </div>
            {visibleActiveRows.length === 0 ? (
              <div className="px-4 py-6 text-sm text-zinc-500">No tables match your filters.</div>
            ) : (
              visibleActiveRows.map((row) => {
                const resolved = teamPageAdminFormDefaults(row.page_config, {
                  tableColor: row.color,
                  tableName: row.name,
                })
                const avatarUrl = resolved.avatarImageUrl.trim()
                return (
                  <div
                    key={row.id}
                    className="grid h-[64px] grid-cols-[minmax(280px,1.4fr)_minmax(140px,0.85fr)_110px_120px] items-center gap-3 border-b border-[#ebebeb] bg-white px-4 last:border-b-0"
                  >
                    <div className="inline-flex items-center gap-3">
                      <span className="h-8 w-8 overflow-hidden rounded-full border border-zinc-200">
                        {avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span
                            className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-white"
                            style={{ backgroundColor: avatarFallbackColor(row.name) }}
                          >
                            {initialsFromName(row.name)}
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-medium text-zinc-900">{row.name}</span>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {row.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-sm text-zinc-700">{row.capacity}</span>
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={(e) => openEditEditor(row, e.currentTarget)}
                        className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <button
              type="button"
              onClick={openCreateEditor}
              className="group relative flex h-[290px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-800 transition-colors group-hover:bg-zinc-900 group-hover:text-white">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <p className="mt-4 text-base font-semibold text-zinc-900">Add new table</p>
              <p className="mt-1 text-sm text-zinc-500">Create a styled team/table experience</p>
            </button>
            {visibleActiveRows.map((row) => {
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
        <div className="admin-gap-card-title-body overflow-hidden rounded-[6px] border border-[#ebebeb] bg-[#f2f2f2]">
          {archivedRows.length === 0 ? (
            <p className="px-4 py-5 text-sm text-zinc-500">No archived tables.</p>
          ) : (
            archivedRows.map((row) => (
              <div
                key={row.id}
                className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 border-b border-[#ebebeb] bg-white px-4 py-3 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium text-[#171717]">{row.name}</p>
                  <p className="text-xs text-zinc-500">Archived</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onRestore(row.id)}
                    className="h-10 rounded-[6px] border border-[#ebebeb] bg-white px-[10px] text-[14px] font-medium text-[#171717]"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm({ id: row.id, name: row.name })}
                    className="h-10 rounded-[6px] border border-rose-200 bg-rose-50 px-[10px] text-[14px] font-medium text-rose-700"
                  >
                    Delete forever
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {deleteConfirm ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return
            setDeleteConfirm(null)
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0_20px_40px_rgba(23,23,23,0.16)]">
            <h3 className="text-lg font-semibold text-[#171717]">Delete archived table?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              This permanently deletes <span className="font-medium text-[#171717]">{deleteConfirm.name}</span>.
              This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="h-10 rounded-[6px] border border-[#ebebeb] bg-white px-[10px] text-[14px] font-medium text-[#171717]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void onDeleteForever(deleteConfirm.id)
                  setDeleteConfirm(null)
                }}
                className="h-10 rounded-[6px] border border-rose-200 bg-rose-50 px-[10px] text-[14px] font-semibold text-rose-700"
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
            className={`relative z-10 flex h-[90vh] max-h-[900px] min-h-0 w-full max-w-[1080px] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm transition-all duration-200 ease-out ${
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

            <div className="relative flex h-full min-h-0 flex-1 flex-col items-center justify-start overflow-hidden [&_button]:cursor-pointer">
              <div className="flex h-full min-h-0 w-full max-w-full flex-1 flex-col items-center justify-start overflow-hidden px-5 py-4 pb-28 [&_input]:!text-[14px] [&_textarea]:!text-[14px] [&_select]:!text-[14px]">
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
                  <div className="w-full max-w-[760px] space-y-5 overflow-visible px-1.5">
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
                          className="rounded-full border border-zinc-200/90 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-all duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-50 hover:shadow"
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
                  <div className="mx-auto flex h-full min-h-0 w-full max-w-[760px] flex-1 flex-col overflow-visible">
                    <div className="relative h-[min(260px,30vh)] min-h-[220px] w-full shrink-0 sm:h-[min(280px,32vh)] sm:min-h-[240px]">
                      <div
                        className={`absolute inset-0 overflow-visible transition-all duration-200 ease-out ${
                          overlayStep === 2
                            ? 'z-10 translate-x-0 opacity-100'
                            : 'pointer-events-none z-0 -translate-x-2 opacity-0'
                        }`}
                      >
                        <div className="flex flex-col items-center space-y-5 pb-2 pt-2">
                          <h4 className="text-center text-2xl font-semibold tracking-tight text-zinc-900">
                            What’s the team identity?
                          </h4>
                          <div className="w-full rounded-2xl bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] p-[1px] shadow-[0_0_0_1px_rgba(91,56,242,0.08),0_0_28px_rgba(28,160,216,0.18)]">
                            <label className="flex h-12 items-center rounded-2xl bg-white px-4">
                              <input
                                ref={taglineInputRef}
                                value={formTheme.teamText}
                                onChange={(e) => setFormTheme((p) => ({ ...p, teamText: e.target.value }))}
                                className="w-full max-w-[680px] bg-transparent !text-[15px] outline-none"
                                placeholder="What's your team tagline?"
                              />
                            </label>
                          </div>
                          <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              onClick={() => avatarInputRef.current?.click()}
                              disabled={avatarUploading}
                              className={`group relative flex h-12 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl border border-zinc-200/80 text-sm font-medium transition-all duration-200 ease-out disabled:opacity-60 ${
                                avatarUploading || avatarReady
                                  ? 'border-transparent bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] text-white'
                                  : 'bg-zinc-50/90 text-zinc-800 hover:border-transparent hover:bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] hover:text-white'
                              }`}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.7}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`relative z-10 h-4 w-4 transition-colors duration-200 ease-out ${
                                  avatarUploading || avatarReady ? 'text-white' : 'text-zinc-500 group-hover:text-white'
                                }`}
                                aria-hidden
                              >
                                <circle cx="12" cy="8" r="3.5" />
                                <path d="M5 20a7 7 0 0 1 14 0" />
                              </svg>
                              <span
                                className={`relative z-10 transition-colors duration-200 ease-out ${
                                  avatarUploading || avatarReady ? 'text-white' : 'group-hover:text-white'
                                }`}
                              >
                                Avatar image
                              </span>
                              {avatarUploading ? (
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="absolute right-3 h-4 w-4 animate-spin text-white"
                                  aria-hidden
                                >
                                  <path d="M21 12a9 9 0 1 1-3.2-6.9" />
                                </svg>
                              ) : avatarReady ? (
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="absolute right-3 h-4 w-4 text-white"
                                  aria-hidden
                                >
                                  <path d="m5 12 5 5L20 7" />
                                </svg>
                              ) : null}
                            </button>
                            <button
                              type="button"
                              onClick={() => heroInputRef.current?.click()}
                              disabled={heroUploading}
                              className={`group relative flex h-12 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl border border-zinc-200/80 text-sm font-medium transition-all duration-200 ease-out disabled:opacity-60 ${
                                heroUploading || heroReady
                                  ? 'border-transparent bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] text-white'
                                  : 'bg-zinc-50/90 text-zinc-800 hover:border-transparent hover:bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] hover:text-white'
                              }`}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.7}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`relative z-10 h-4 w-4 transition-colors duration-200 ease-out ${
                                  heroUploading || heroReady ? 'text-white' : 'text-zinc-500 group-hover:text-white'
                                }`}
                                aria-hidden
                              >
                                <rect x="3" y="5" width="18" height="14" rx="2" />
                                <circle cx="8.5" cy="10" r="1.2" />
                                <path d="m21 15-6-5-4 4-3-3-5 5" />
                              </svg>
                              <span
                                className={`relative z-10 transition-colors duration-200 ease-out ${
                                  heroUploading || heroReady ? 'text-white' : 'group-hover:text-white'
                                }`}
                              >
                                Hero image
                              </span>
                              {heroUploading ? (
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="absolute right-3 h-4 w-4 animate-spin text-white"
                                  aria-hidden
                                >
                                  <path d="M21 12a9 9 0 1 1-3.2-6.9" />
                                </svg>
                              ) : heroReady ? (
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="absolute right-3 h-4 w-4 text-white"
                                  aria-hidden
                                >
                                  <path d="m5 12 5 5L20 7" />
                                </svg>
                              ) : null}
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-3">
                            <div className="flex flex-wrap items-center justify-center gap-2.5">
                              {THEME_PRESETS.map((preset) => {
                                const selected = formPresetId === preset.id
                                return (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => applyPreset(preset.id)}
                                    aria-label={`Theme preset ${preset.name}`}
                                    className={`h-10 w-10 rounded-full cursor-pointer transition-[transform,box-shadow,filter] duration-200 ease-out hover:scale-[1.05] hover:brightness-105 hover:shadow-[0_8px_24px_rgba(24,24,27,0.16)] ${
                                      selected
                                        ? 'scale-[1.02] ring-2 ring-zinc-900/50 ring-offset-2 shadow-[0_6px_16px_rgba(24,24,27,0.14)]'
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
                              className={`group inline-flex items-center justify-center gap-2 ${FOOTER_BTN_SECONDARY} text-zinc-600 transition-all duration-200 ease-out hover:border-transparent hover:bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] hover:text-white`}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.8}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4 text-zinc-500 transition-colors duration-200 ease-out group-hover:text-white"
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
                        className={`absolute inset-0 overflow-hidden transition-all duration-200 ease-out ${
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
                          <div className="flex flex-wrap justify-center gap-3">
                            {THEME_PRESETS.map((preset) => {
                              const selected = formPresetId === preset.id
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => applyPreset(preset.id)}
                                  aria-label={`Theme preset ${preset.name}`}
                                  className={`h-11 w-11 rounded-full transition-[transform,box-shadow,filter] duration-200 ease-out hover:scale-[1.05] hover:brightness-105 hover:shadow-[0_10px_26px_rgba(24,24,27,0.18)] ${
                                    selected
                                      ? 'scale-[1.02] ring-2 ring-zinc-900/55 ring-offset-[3px] shadow-[0_8px_18px_rgba(24,24,27,0.16)]'
                                      : 'ring-1 ring-zinc-200/90'
                                  }`}
                                  style={{
                                    background: `linear-gradient(145deg, ${preset.tableGradTop}, ${preset.tableGradBottom})`,
                                  }}
                                />
                              )
                            })}
                          </div>
                          <div className="relative w-full space-y-3 rounded-2xl border border-zinc-100/90 bg-zinc-50/50 p-3">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex items-center justify-center gap-3">
                                <span className="text-xs font-semibold text-zinc-600">Main color</span>
                                <button
                                  type="button"
                                  data-color-dot="true"
                                  onClick={(e) => openColorPicker('primaryColor', e.currentTarget)}
                                  className="h-9 w-9 rounded-full border border-white/80 shadow-sm ring-1 ring-zinc-200/80"
                                  style={{ backgroundColor: formTheme.primaryColor }}
                                  aria-label="Main color"
                                />
                              </div>
                              <div className="flex items-center justify-center gap-3">
                                <span className="text-xs font-semibold text-zinc-600">Leaderboard gradient</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    data-color-dot="true"
                                    onClick={(e) => openColorPicker('lbGradTop', e.currentTarget)}
                                    className="h-9 w-9 rounded-full border border-white/80 shadow-sm ring-1 ring-zinc-200/80"
                                    style={{ backgroundColor: formTheme.lbGradTop }}
                                    aria-label="Leaderboard gradient top"
                                  />
                                  <button
                                    type="button"
                                    data-color-dot="true"
                                    onClick={(e) => openColorPicker('lbGradBottom', e.currentTarget)}
                                    className="h-9 w-9 rounded-full border border-white/80 shadow-sm ring-1 ring-zinc-200/80"
                                    style={{ backgroundColor: formTheme.lbGradBottom }}
                                    aria-label="Leaderboard gradient bottom"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-center gap-3 border-t border-zinc-100/80 pt-3">
                              <span className="text-xs font-semibold text-zinc-600">Hero section gradient</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  data-color-dot="true"
                                  onClick={(e) => openColorPicker('heroTop', e.currentTarget)}
                                  className="h-9 w-9 rounded-full border border-white/80 shadow-sm ring-1 ring-zinc-200/80"
                                  style={{ backgroundColor: formTheme.heroTop }}
                                  aria-label="Hero section top"
                                />
                                <button
                                  type="button"
                                  data-color-dot="true"
                                  onClick={(e) => openColorPicker('heroMiddle', e.currentTarget)}
                                  className="h-9 w-9 rounded-full border border-white/80 shadow-sm ring-1 ring-zinc-200/80"
                                  style={{ backgroundColor: formTheme.heroMiddle }}
                                  aria-label="Hero section middle"
                                />
                                <button
                                  type="button"
                                  data-color-dot="true"
                                  onClick={(e) => openColorPicker('heroBottom', e.currentTarget)}
                                  className="h-9 w-9 rounded-full border border-white/80 shadow-sm ring-1 ring-zinc-200/80"
                                  style={{ backgroundColor: formTheme.heroBottom }}
                                  aria-label="Hero section bottom"
                                />
                              </div>
                            </div>
                            {openColorField && colorPopoverPos && typeof window !== 'undefined'
                              ? createPortal(
                                  <div
                                    ref={colorPickerRef}
                                    className="fixed z-[80] w-52 -translate-x-1/2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-md"
                                    style={{ left: colorPopoverPos.left, top: colorPopoverPos.top }}
                                  >
                                    <div
                                      ref={svPanelRef}
                                      className="relative h-36 w-full cursor-crosshair"
                                      style={{ backgroundColor: `hsl(${pickerHsv.h} 100% 50%)` }}
                                      onMouseDown={(e) => {
                                        e.preventDefault()
                                        draggingSvRef.current = true
                                        updateSvFromPointer(e.clientX, e.clientY)
                                      }}
                                    >
                                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white to-transparent" />
                                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black to-transparent" />
                                      <span
                                        className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                                        style={{
                                          left: `${pickerHsv.s * 100}%`,
                                          top: `${(1 - pickerHsv.v) * 100}%`,
                                        }}
                                      />
                                    </div>
                                    <div className="space-y-2 border-t border-zinc-100 p-3">
                                      <input
                                        type="range"
                                        min={0}
                                        max={360}
                                        value={pickerHsv.h}
                                        onChange={(e) =>
                                          updatePickerColor({
                                            h: Number(e.target.value),
                                            s: pickerHsv.s,
                                            v: pickerHsv.v,
                                          })
                                        }
                                        className="h-2 w-full cursor-pointer accent-violet-600"
                                        aria-label="Hue"
                                      />
                                      <div className="flex items-center gap-2">
                                        <span
                                          className="h-6 w-6 shrink-0 rounded-md border border-zinc-200"
                                          style={{ backgroundColor: pickerHex }}
                                          aria-hidden
                                        />
                                        <input
                                          value={pickerHex}
                                          onChange={(e) => {
                                            const next = e.target.value
                                            setPickerHex(next)
                                            const normalized = normalizeHex(next)
                                            if (!normalized || !openColorField) return
                                            setColorField(openColorField, normalized)
                                            setPickerHsv(hexToHsv(normalized))
                                          }}
                                          className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-700"
                                          aria-label="Hex color"
                                        />
                                      </div>
                                    </div>
                                  </div>,
                                  document.body
                                )
                              : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex w-full shrink-0 justify-center overflow-hidden px-2 pt-8">
                      <div className="relative w-full max-w-[340px] overflow-visible rounded-[28px]">
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

            {mode === 'edit' && editingId && (overlayStep === 2 || overlayStep === 3) ? (
              <div className="absolute bottom-6 left-6 z-20">
                <button
                  type="button"
                  onClick={() => void onArchive(editingId)}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700"
                >
                  Archive table
                </button>
              </div>
            ) : null}
            <div className="absolute bottom-6 right-6 z-20 flex flex-row gap-3">
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
                    <span className="text-sm font-medium text-zinc-700">Seats</span>
                    <input
                      type="number"
                      min={1}
                      value={formCapacity}
                      onChange={(e) => setFormCapacity(Math.max(1, Number(e.target.value) || 1))}
                      className="w-14 shrink-0 rounded-lg border-0 border-b border-zinc-200 bg-transparent py-1 text-center text-sm font-medium text-zinc-900 outline-none transition-colors duration-200 ease-out focus:border-zinc-400"
                      aria-label="Seat capacity"
                    />
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

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center">
          <div
            className={`inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium shadow-sm animate-[fadeIn_180ms_ease-out] ${
              toast.kind === 'success'
                ? 'border-emerald-200 text-emerald-700'
                : 'border-rose-200 text-rose-700'
            }`}
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
              {toast.kind === 'success' ? <path d="m5 12 5 5L20 7" /> : <path d="M12 8v5m0 3h.01" />}
            </svg>
            <span>{toast.message}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

