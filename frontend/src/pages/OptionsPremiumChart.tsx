// ─── OptionsPremiumChart.tsx ──────────────────────────────────────────────
// Options Premium Chart — Multi-contract OHLCV with amCharts 5 full indicators.
// Route: /optionspremium

import { AlertCircle, BarChart2, Loader2, Plus, RefreshCw, X } from 'lucide-react'
import { useSupportedExchanges } from '@/hooks/useSupportedExchanges'
import { useThemeStore } from '@/stores/themeStore'
import { useOptionsPremiumData, type Contract } from '@/hooks/useOptionsPremiumData'
import StockChartAmCharts from '@/components/options-premium/StockChartAmCharts'
import StrikeCombobox from '@/components/options-premium/StrikeCombobox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { usePageTitle } from '@/hooks/usePageTitle'

// Pill colour palette — cycled through as contracts are added
const PILL_COLORS = [
  '#2962ff', '#26a69a', '#ef5350', '#f9a825', '#8e24aa',
  '#00bcd4', '#ff7043', '#66bb6a', '#7c4dff', '#ec407a',
]

function getPillColor(index: number): string {
  return PILL_COLORS[index % PILL_COLORS.length]
}

// Strike offset options (-10 to +20)
const OFFSET_OPTIONS = Array.from({ length: 31 }, (_, i) => i - 10)

// Interval minutes → display label
const INTERVAL_LABELS: Record<number, string> = {
  1: '1m', 5: '5m', 15: '15m', 30: '30m', 60: '1H', 1440: '1D',
}

function ContractPill({
  contract, colorIndex, onToggle, onRemove,
}: {
  contract: Contract
  colorIndex: number
  onToggle: () => void
  onRemove: () => void
}) {
  const color = getPillColor(colorIndex)
  return (
    <div
      className={`onc-pill ${contract.selected ? 'onc-pill--active' : 'onc-pill--inactive'}`}
      style={{ '--pill-color': color } as React.CSSProperties}
    >
      <span className="onc-pill__dot" style={{ background: color }} />
      <button
        className="onc-pill__body"
        onClick={onToggle}
        title={contract.selected ? 'Click to hide' : 'Click to show'}
      >
        <span className="onc-pill__label">{contract.index}</span>
        <span className="onc-pill__strike">{contract.strike}</span>
        <span className={`onc-pill__type onc-pill__type--${contract.optionType.toLowerCase()}`}>
          {contract.optionType}
        </span>
        <span className="onc-pill__expiry">{contract.expiryDisplay}</span>
        {contract.source === 'atm' && <span className="onc-pill__badge">ATM</span>}
      </button>
      <button
        className="onc-pill__remove"
        onClick={e => { e.stopPropagation(); onRemove() }}
        title="Remove contract"
        aria-label={`Remove ${contract.strike} ${contract.optionType}`}
      >
        <X size={11} />
      </button>
    </div>
  )
}

export default function OptionsPremiumChart() {
  usePageTitle()
  const { mode } = useThemeStore()
  const isDark = mode === 'dark'

  const {
    toolsFnoExchanges: fnoExchanges,
    defaultToolsFnoExchange: defaultFnoExchange,
    defaultUnderlyings,
  } = useSupportedExchanges()

  const hook = useOptionsPremiumData()

  // Underlying options based on selected exchange
  const underlyingOptions = defaultUnderlyings[hook.exchange] || defaultUnderlyings[defaultFnoExchange] || []

  const handleAddManual = () => {
    if (!hook.manualStrike) return
    const added = hook.handleAddManualContract({
      strike: hook.manualStrike,
      optionType: hook.manualOptType,
    })
    if (!added) {
      // Duplicate — silently ignore
    }
  }

  const chartTitle = hook.contracts.length > 0
    ? `${hook.index} ${hook.contracts.map(c => `${c.strike}${c.optionType}`).join(' + ')}`
    : 'Options Premium'

  return (
    <div className="onc-root">
      {/* ── Row 1: Settings bar ───────────────────────────────────────── */}
      <div className="onc-top-bar">
        {/* Exchange */}
        <div className="onc-ctrl-group">
          <span className="onc-label">Exchange</span>
          <Select
            value={hook.exchange}
            onValueChange={v => { hook.setExchange(v) }}
          >
            <SelectTrigger id="onc-exchange-select" className="onc-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fnoExchanges.map(ex => (
                <SelectItem key={ex.value} value={ex.value}>{ex.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Underlying */}
        <div className="onc-ctrl-group">
          <span className="onc-label">Underlying</span>
          <Select
            value={hook.index}
            onValueChange={v => hook.setIndex(v)}
          >
            <SelectTrigger id="onc-underlying-select" className="onc-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {underlyingOptions.map(u => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Open price display */}
        {hook.openPrice !== null && (
          <div className="onc-open-price">
            <span className="onc-label">Open</span>
            <span className="onc-open-price__value">{hook.openPrice.toLocaleString('en-IN')}</span>
          </div>
        )}

        <div className="onc-divider" />

        {/* Expiry */}
        <div className="onc-ctrl-group">
          <span className="onc-label">Expiry</span>
          <Select
            value={hook.selectedExpiry}
            onValueChange={hook.setSelectedExpiry}
          >
            <SelectTrigger id="onc-expiry-select" className="onc-select onc-select--expiry">
              <SelectValue placeholder="Select expiry" />
            </SelectTrigger>
            <SelectContent>
              {hook.expiries.map(e => (
                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="onc-divider" />

        {/* Strike picker (manual add) */}
        <div className="onc-ctrl-group">
          <span className="onc-label">Strike</span>
          <StrikeCombobox
            value={hook.manualStrike}
            onChange={hook.setManualStrike}
            index={hook.index}
          />
        </div>

        {/* CE / PE toggle */}
        <div className="onc-type-toggle">
          <button
            id="onc-type-ce"
            className={`onc-type-btn ${hook.manualOptType === 'CE' ? 'onc-type-btn--active-ce' : ''}`}
            onClick={() => hook.setManualOptType('CE')}
          >
            CE
          </button>
          <button
            id="onc-type-pe"
            className={`onc-type-btn ${hook.manualOptType === 'PE' ? 'onc-type-btn--active-pe' : ''}`}
            onClick={() => hook.setManualOptType('PE')}
          >
            PE
          </button>
        </div>

        {/* Add contract button */}
        <button
          id="onc-add-contract-btn"
          className="onc-add-btn"
          onClick={handleAddManual}
          disabled={!hook.manualStrike || !hook.selectedExpiry}
        >
          <Plus size={13} /> Add
        </button>

        <div className="onc-divider" />

        {/* Strike offset */}
        <div className="onc-ctrl-group">
          <span className="onc-label">Offset</span>
          <Select
            value={String(hook.strikeOffset)}
            onValueChange={v => hook.setStrikeOffset(Number(v))}
          >
            <SelectTrigger id="onc-offset-select" className="onc-select onc-select--offset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OFFSET_OPTIONS.map(o => (
                <SelectItem key={o} value={String(o)}>
                  {o > 0 ? `+${o}` : String(o)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Reload */}
        <Button
          id="onc-reload-btn"
          variant="default"
          size="sm"
          className="onc-reload-btn"
          onClick={hook.handleReload}
          disabled={hook.isLoading || !hook.selectedExpiry}
        >
          {hook.isLoading ? (
            <Loader2 size={13} className="animate-spin mr-1" />
          ) : (
            <RefreshCw size={13} className="mr-1" />
          )}
          Reload
        </Button>

        {/* Flush contracts checkbox */}
        <label className="onc-flush-check">
          <input
            type="checkbox"
            checked={hook.flushContracts}
            onChange={e => hook.setFlushContracts(e.target.checked)}
          />
          <span>Flush Contracts</span>
        </label>
      </div>

      {/* ── Row 2: Pill bar ───────────────────────────────────────────── */}
      <div className="onc-pill-bar">
        <div className="onc-pill-bar__pills">
          {hook.contracts.length === 0 ? (
            <span className="onc-pill-bar__empty">No contracts loaded — click Reload to load ATM CE+PE</span>
          ) : (
            hook.contracts.map((c, i) => (
              <ContractPill
                key={c.key}
                contract={c}
                colorIndex={i}
                onToggle={() => hook.handleToggleContract(c.key)}
                onRemove={() => hook.handleRemoveContract(c.key)}
              />
            ))
          )}
        </div>

        <div className="onc-pill-bar__right">
          {/* Session gap toggle */}
          <label className="onc-flush-check">
            <input
              type="checkbox"
              checked={hook.applySessionGap}
              onChange={e => hook.setApplySessionGap(e.target.checked)}
            />
            <span>Remove Session Gap</span>
          </label>

          {/* Interval selector */}
          <div className="onc-ctrl-group">
            <span className="onc-label">Interval</span>
            <Select
              value={String(hook.intervalMins)}
              onValueChange={v => hook.setIntervalMins(Number(v))}
            >
              <SelectTrigger id="onc-interval-select" className="onc-select onc-select--interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(INTERVAL_LABELS).map(([mins, label]) => (
                  <SelectItem key={mins} value={mins}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Live status badge */}
          <div className={`onc-live-badge ${hook.isLiveMode ? 'onc-live-badge--live' : 'onc-live-badge--closed'}`}>
            <span className="onc-live-badge__dot" />
            {hook.isLiveMode ? 'Live' : 'Market Closed'}
          </div>
        </div>
      </div>

      {/* ── Chart Area ───────────────────────────────────────────────── */}
      <div className="onc-chart-area">
        {/* Error overlay */}
        {hook.error && !hook.isLoading && (
          <div className="onc-overlay onc-overlay--error">
            <AlertCircle size={40} />
            <h3>Failed to load data</h3>
            <p>{hook.error}</p>
            <Button variant="outline" size="sm" onClick={hook.handleReload}>
              <RefreshCw size={13} className="mr-1" /> Retry
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!hook.error && !hook.isLoading && hook.chartData.length === 0 && (
          <div className="onc-overlay onc-overlay--empty">
            <BarChart2 size={48} />
            <h3>No data</h3>
            <p>
              Select Exchange, Underlying, and Expiry then click{' '}
              <strong>Reload</strong> to load ATM CE+PE contracts.
            </p>
          </div>
        )}

        {/* amCharts 5 Stock Chart */}
        <StockChartAmCharts
          data={hook.chartData}
          chartTitle={chartTitle}
          theme={isDark ? 'dark' : 'light'}
          onIntervalChange={hook.setIntervalMins}
          chartId="onc-chartdiv"
          controlsId="onc-chartcontrols"
        />
      </div>
    </div>
  )
}
