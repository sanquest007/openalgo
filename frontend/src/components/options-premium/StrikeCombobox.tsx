// ─── StrikeCombobox.tsx ───────────────────────────────────────────────────
// Searchable strike price dropdown using React portal to prevent clipping.
// Ported from thirdPrj/src/components/StrikeCombobox.jsx

import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface StrikeConfig {
  center: number
  step: number
  halfRange: number
}

const STRIKE_CONFIG: Record<string, StrikeConfig> = {
  NIFTY:      { center: 24200, step: 50,  halfRange: 5000 },
  BANKNIFTY:  { center: 53000, step: 100, halfRange: 8000 },
  FINNIFTY:   { center: 23500, step: 50,  halfRange: 5000 },
  MIDCPNIFTY: { center: 11500, step: 25,  halfRange: 3000 },
}

function generateStrikes(index: string): string[] {
  const cfg = STRIKE_CONFIG[index] ?? STRIKE_CONFIG.NIFTY
  const snapped = Math.round(cfg.center / cfg.step) * cfg.step
  const strikes: string[] = []
  for (let s = snapped - cfg.halfRange; s <= snapped + cfg.halfRange; s += cfg.step)
    strikes.push(String(s))
  return strikes
}

interface StrikeComboboxProps {
  value: string
  onChange: (value: string) => void
  index: string
}

export default function StrikeCombobox({ value, onChange, index }: StrikeComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const wrapRef  = useRef<HTMLDivElement>(null)
  const listRef  = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const strikes = useMemo(() => generateStrikes(index), [index])
  const filtered = useMemo(
    () => query ? strikes.filter(s => s.includes(query)) : strikes,
    [strikes, query]
  )

  // Snap to nearest step when index changes
  useEffect(() => {
    const cfg = STRIKE_CONFIG[index] ?? STRIKE_CONFIG.NIFTY
    const snapped = String(Math.round((parseInt(value, 10) || cfg.center) / cfg.step) * cfg.step)
    if (snapped !== value) onChange(snapped)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // Scroll highlighted into view
  useEffect(() => {
    if (listRef.current && highlighted >= 0) {
      ;(listRef.current.children[highlighted] as HTMLElement)?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlighted])

  // Close on outside pointerdown
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const portal = document.getElementById('strike-premium-portal')
      if (!wrapRef.current?.contains(e.target as Node) && !portal?.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    const tid = setTimeout(() => document.addEventListener('pointerdown', onPointer), 0)
    return () => { clearTimeout(tid); document.removeEventListener('pointerdown', onPointer) }
  }, [open])

  const close = () => { setOpen(false); setQuery('') }

  const openDropdown = () => {
    if (!wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + window.scrollY + 2, left: rect.left + window.scrollX })
    const idx = strikes.indexOf(value)
    setHighlighted(idx >= 0 ? idx : 0)
    setQuery('')
    setOpen(true)
    setTimeout(() => {
      inputRef.current?.focus()
      if (listRef.current) {
        const el = listRef.current.children[idx >= 0 ? idx : 0] as HTMLElement
        el?.scrollIntoView({ block: 'center' })
      }
    }, 20)
  }

  const pick = (s: string) => { onChange(s); close() }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')  { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter')    { e.preventDefault(); filtered[highlighted] && pick(filtered[highlighted]) }
    else if (e.key === 'Escape')   { close() }
  }

  return (
    <div ref={wrapRef} className="ib__select-wrap onc-strike-wrap" style={{ cursor: 'pointer' }} onClick={openDropdown}>
      <div
        id="strike-premium-combo-trigger"
        className="ib__select onc-strike-combo"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Strike price"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDropdown() } }}
      >
        {value || '—'}
      </div>
      <ChevronDown
        size={12}
        className="ib__chevron"
        style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
      />

      {open && createPortal(
        <div
          id="strike-premium-portal"
          className="onc-strike-portal"
          style={{ top: pos.top, left: pos.left, position: 'fixed', zIndex: 9999 }}
        >
          <div className="onc-strike-portal__search">
            <Search size={11} className="onc-strike-portal__icon" />
            <input
              ref={inputRef}
              id="strike-premium-search-input"
              type="text"
              className="onc-strike-portal__input"
              placeholder="Search strike…"
              value={query}
              onChange={e => { setQuery(e.target.value); setHighlighted(0) }}
              onKeyDown={onKey}
              autoComplete="off"
            />
          </div>
          <ul ref={listRef} className="onc-strike-portal__list" role="listbox">
            {filtered.length === 0
              ? <li className="onc-strike-portal__empty">No match</li>
              : filtered.map((s, i) => (
                  <li
                    key={s}
                    className={['onc-strike-portal__item', s === value ? 'sel' : '', i === highlighted ? 'hi' : ''].join(' ')}
                    role="option"
                    aria-selected={s === value}
                    onMouseEnter={() => setHighlighted(i)}
                    onMouseDown={e => { e.preventDefault(); pick(s) }}
                  >
                    {s}
                  </li>
                ))
            }
          </ul>
        </div>,
        document.body
      )}
    </div>
  )
}
