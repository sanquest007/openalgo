// ─── IndicatorTemplates.tsx ───────────────────────────────────────────────
// Save and reload amCharts 5 stock indicator configurations.
// Ported from thirdPrj/src/components/IndicatorTemplates.jsx
// Uses localStorage key 'openalgo_indicator_templates_v1'.

import * as am5 from '@amcharts/amcharts5'
import * as am5stock from '@amcharts/amcharts5/stock'
import { Bookmark, ChevronDown, Download, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'openalgo_indicator_templates_v1'

// Dynamic registry built from all am5stock exports at module load time
const INDICATOR_REGISTRY: Record<string, unknown> = {}
Object.keys(am5stock).forEach(key => {
  const cls = (am5stock as Record<string, unknown>)[key]
  if (cls && typeof cls === 'function' && (cls as { prototype?: unknown }).prototype) {
    INDICATOR_REGISTRY[key] = cls
  }
})

// Common settings keys to capture for each indicator
const COMMON_SETTINGS_KEYS = [
  'period', 'seriesColor', 'standardDeviations',
  'fastPeriod', 'slowPeriod', 'signalPeriod',
  'overSold', 'overBought', 'deviation',
  'dPeriod', 'kPeriod', 'multiplier',
  'smoothingPeriod', 'field',
]

interface IndicatorConfig {
  typeName: string
  settings: Record<string, unknown>
}

interface Template {
  id: number
  name: string
  savedAt: string
  indicators: IndicatorConfig[]
}

function getIndicatorTypeName(ind: unknown): string | null {
  const ctor = (ind as { constructor?: { className?: string; name?: string } })?.constructor
  const name = ctor?.className || ctor?.name
  return name && INDICATOR_REGISTRY[name] ? name : null
}

function serializeIndicators(stockChart: am5stock.StockChart): IndicatorConfig[] {
  const result: IndicatorConfig[] = []
  try {
    const items = (stockChart.indicators as { values?: unknown[] })?.values ?? []
    for (const ind of items) {
      const typeName = getIndicatorTypeName(ind)
      if (!typeName) continue
      const settings: Record<string, unknown> = {}
      COMMON_SETTINGS_KEYS.forEach(k => {
        try {
          const v = (ind as { get: (k: string) => unknown }).get(k)
          if (v == null) return
          settings[k] = v && typeof v === 'object' && typeof (v as { toCSSHex?: () => string }).toCSSHex === 'function'
            ? (v as { toCSSHex: () => string }).toCSSHex()
            : v
        } catch (_) { /* ignore */ }
      })
      result.push({ typeName, settings })
    }
  } catch (e) {
    console.error('[IndicatorTemplates] serialize error:', e)
  }
  return result
}

function applyIndicators(
  chartRefs: {
    root: am5.Root
    stockChart: am5stock.StockChart
    valueSeries: am5xy.XYSeries
    valueLegend: am5stock.StockLegend
  },
  savedIndicators: IndicatorConfig[]
) {
  const { root, stockChart, valueSeries, valueLegend } = chartRefs
  try {
    ;[...((stockChart.indicators as { values?: unknown[] })?.values ?? [])].forEach(ind => {
      try { (ind as { dispose: () => void }).dispose() } catch (_) { /* ignore */ }
    })
    setTimeout(() => {
      savedIndicators.forEach(({ typeName, settings }) => {
        const Cls = INDICATOR_REGISTRY[typeName] as (new (...args: unknown[]) => unknown) & { new: (...args: unknown[]) => unknown } | undefined
        if (!Cls) return
        const restored: Record<string, unknown> = { ...settings }
        ;['seriesColor'].forEach(ck => {
          if (typeof restored[ck] === 'string' && (restored[ck] as string).startsWith('#')) {
            try { restored[ck] = am5.color(restored[ck] as string) } catch (_) { /* ignore */ }
          }
        })
        try {
          ;(stockChart.indicators as { push: (v: unknown) => void }).push(
            (Cls as unknown as { new: (root: am5.Root, settings: Record<string, unknown>) => unknown }).new(root, {
              stockChart, stockSeries: valueSeries, legend: valueLegend, ...restored
            })
          )
        } catch (e) { console.warn('[IndicatorTemplates] create failed:', typeName, e) }
      })
    }, 150)
  } catch (e) { console.error('[IndicatorTemplates] apply error:', e) }
}

// Need am5xy for type annotation
import type * as am5xy from '@amcharts/amcharts5/xy'

interface IndicatorTemplatesProps {
  // biome-ignore lint/suspicious/noExplicitAny: amCharts chart refs are complex
  chartRef: React.RefObject<any>
}

export default function IndicatorTemplates({ chartRef }: IndicatorTemplatesProps) {
  const [templates, setTemplates]       = useState<Template[]>([])
  const [open, setOpen]                 = useState(false)
  const [savingName, setSavingName]     = useState('')
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [feedback, setFeedback]         = useState('')
  const menuRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) setTemplates(JSON.parse(raw)) } catch (_) { /* ignore */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(templates)) } catch (_) { /* ignore */ }
  }, [templates])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false); setShowSaveForm(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const flash = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 2500) }

  const handleSave = useCallback(() => {
    const c = chartRef.current
    if (!c?.stockChart) { flash('⚠ Chart not ready'); return }
    const indicators = serializeIndicators(c.stockChart)
    if (indicators.length === 0) { flash('⚠ No active indicators to save'); return }
    const name = savingName.trim() || `Template ${templates.length + 1}`
    setTemplates(prev => [...prev, { id: Date.now(), name, savedAt: new Date().toLocaleString(), indicators }])
    setSavingName(''); setShowSaveForm(false)
    flash(`✓ Saved "${name}" (${indicators.length} indicator${indicators.length !== 1 ? 's' : ''})`)
  }, [chartRef, savingName, templates.length])

  const handleLoad = useCallback((t: Template) => {
    const c = chartRef.current
    if (!c) return
    applyIndicators(c, t.indicators)
    setOpen(false)
    flash(`✓ Loaded "${t.name}"`)
  }, [chartRef])

  const handleDelete = useCallback((id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setTemplates(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <div className="onc-ind-tmpl" ref={menuRef}>
      <button
        id="indicator-templates-btn"
        className={`onc-ind-tmpl__trigger ${open ? 'open' : ''}`}
        onClick={() => { setOpen(o => !o); setShowSaveForm(false) }}
        title="Indicator Templates"
      >
        <Bookmark size={13} />
        <span>Templates</span>
        <ChevronDown size={11} className={`onc-ind-tmpl__arrow ${open ? 'open' : ''}`} />
      </button>

      {feedback && (
        <span className={`onc-ind-tmpl__feedback ${feedback.startsWith('✓') ? 'ok' : 'warn'}`}>
          {feedback}
        </span>
      )}

      {open && (
        <div className="onc-ind-tmpl__panel">
          <div className="onc-ind-tmpl__header">
            <span>Indicator Templates</span>
            <button
              className="onc-ind-tmpl__save-trigger"
              onClick={() => { setShowSaveForm(s => !s); setTimeout(() => inputRef.current?.focus(), 40) }}
            >
              <Plus size={12} /> Save current
            </button>
          </div>

          {showSaveForm && (
            <div className="onc-ind-tmpl__save-form">
              <input
                ref={inputRef}
                id="indicator-template-name-input"
                type="text"
                className="onc-ind-tmpl__name-input"
                placeholder="Template name…"
                value={savingName}
                onChange={e => setSavingName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveForm(false) }}
              />
              <button className="onc-ind-tmpl__confirm-btn" onClick={handleSave}>Save</button>
            </div>
          )}

          <div className="onc-ind-tmpl__list">
            {templates.length === 0 ? (
              <p className="onc-ind-tmpl__empty">
                No templates yet.<br />Add indicators then click "Save current".
              </p>
            ) : templates.map(t => (
              <div key={t.id} className="onc-ind-tmpl__item" onClick={() => handleLoad(t)}>
                <div className="onc-ind-tmpl__item-main">
                  <Download size={11} className="onc-ind-tmpl__item-icon" />
                  <div className="onc-ind-tmpl__item-info">
                    <span className="onc-ind-tmpl__item-name">{t.name}</span>
                    <span className="onc-ind-tmpl__item-meta">
                      {t.indicators.length} indicator{t.indicators.length !== 1 ? 's' : ''} · {t.savedAt}
                    </span>
                  </div>
                </div>
                <button className="onc-ind-tmpl__delete" onClick={e => handleDelete(t.id, e)} title="Delete">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
