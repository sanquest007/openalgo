// ─── useOptionsPremiumData.ts ─────────────────────────────────────────────
// All state and side-effect logic for the Options Premium Chart page.
// Ported from thirdPrj/src/hooks/useNormChartData.js and adapted for OpenAlgo.
//
// Key differences from thirdPrj:
//   - Open price comes from live quotes API (not DuckDB)
//   - Expiries fetched from OpenAlgo symbol search
//   - Contract data from OpenAlgo history API
//   - Live polling every 60s when today + market open

import { useCallback, useEffect, useRef, useState } from 'react'
import { optionsPremiumApi, type OHLCVPoint } from '@/api/options-premium'
import { aggregateDatasets } from '@/utils/options-premium/aggregation'
import { removeSessionGap } from '@/utils/options-premium/sessionGapRemoval'
import { resample } from '@/utils/options-premium/resample'
import { useMarketStatus } from '@/hooks/useMarketStatus'
import { usePageVisibility } from '@/hooks/usePageVisibility'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDateForAPI(dateStr: string): string {
  // Convert YYYY-MM-DD → YYYY-MM-DD (already in correct format for backend)
  return dateStr
}

export interface Contract {
  key: string
  index: string
  exchange: string
  strike: string
  optionType: 'CE' | 'PE'
  expiry: string       // DDMMMYY format
  expiryDisplay: string
  source: 'atm' | 'manual'
  selected: boolean
}

export interface Expiry {
  label: string   // Display label (e.g. "05JUN26")
  value: string   // API value (e.g. "05JUN26")
}

export function useOptionsPremiumData() {
  // ── Core selections ──────────────────────────────────────────────────
  const [index,           setIndex]           = useState('NIFTY')
  const [exchange,        setExchange]        = useState('NFO')
  const [selectedDate,    setSelectedDate]    = useState(todayStr)

  // ── Open price ───────────────────────────────────────────────────────
  const [openPrice,       setOpenPrice]       = useState<number | null>(null)
  const [openPriceOverride, setOpenPriceOverride] = useState('')
  const [atmStrike,       setAtmStrike]       = useState<number | null>(null)

  // ── Expiry ───────────────────────────────────────────────────────────
  const [expiries,        setExpiries]        = useState<Expiry[]>([])
  const [selectedExpiry,  setSelectedExpiry]  = useState('')

  // ── Manual contract builder ──────────────────────────────────────────
  const [manualStrike,    setManualStrike]    = useState('')
  const [manualOptType,   setManualOptType]   = useState<'CE' | 'PE'>('CE')
  const [strikeOffset,    setStrikeOffset]    = useState(0)

  // ── Contracts & chart ────────────────────────────────────────────────
  const [contracts,       setContracts]       = useState<Contract[]>([])
  const [chartData,       setChartData]       = useState<OHLCVPoint[]>([])
  const [intervalMins,    setIntervalMins]    = useState(5)
  const [isLoading,       setIsLoading]       = useState(false)
  const [error,           setError]           = useState<string | null>(null)

  // ── Toggles ──────────────────────────────────────────────────────────
  const [flushContracts,  setFlushContracts]  = useState(false)
  const [applySessionGap, setApplySessionGap] = useState(false)

  // ── Raw data cache ───────────────────────────────────────────────────
  const [rawDatasetsByKey, setRawDatasetsByKey] = useState<Record<string, OHLCVPoint[]>>({})

  // ── Live market status ───────────────────────────────────────────────
  const { isMarketOpen } = useMarketStatus()
  const { isVisible }    = usePageVisibility()
  const liveIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef         = useRef({ valid: false })

  // ── Is today selected and market open? ───────────────────────────────
  const isLiveMode = selectedDate === todayStr() && isMarketOpen('NFO')

  // ── Fetch expiries for selected index ────────────────────────────────
  useEffect(() => {
    async function loadExpiries() {
      try {
        // Use fno-search based expiries via the search blueprint
        const resp = await fetch(
          `/search/api/expiries?exchange=${encodeURIComponent(exchange)}&underlying=${encodeURIComponent(index)}`,
          { credentials: 'include' }
        )
        if (resp.ok) {
          const data = await resp.json()
          if (data.status === 'success' && Array.isArray(data.expiries)) {
            const exps: Expiry[] = data.expiries.map((e: string) => ({ label: e, value: e }))
            setExpiries(exps)
            if (exps.length > 0 && !selectedExpiry) {
              setSelectedExpiry(exps[0].value)
            }
          }
        }
      } catch (err) {
        console.warn('[useOptionsPremiumData] loadExpiries failed:', err)
      }
    }
    loadExpiries()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, exchange])

  // ── Reload handler ───────────────────────────────────────────────────
  const handleReload = useCallback(async () => {
    if (!selectedExpiry) return

    // Cancel previous load
    abortRef.current.valid = false
    const isCurrent = { valid: true }
    abortRef.current = isCurrent

    setIsLoading(true)
    setError(null)

    try {
      // Step 1: Resolve ATM CE/PE symbols
      const atmResp = await optionsPremiumApi.resolveATM({
        underlying: index,
        exchange,
        expiry_date: selectedExpiry,
        strike_offset: strikeOffset,
      })

      if (!isCurrent.valid) return

      if (atmResp.status !== 'success' || !atmResp.data) {
        setError(atmResp.message || 'Failed to resolve ATM strike')
        setIsLoading(false)
        return
      }

      const { atm_strike, underlying_open, ce_symbol, pe_symbol, options_exchange } = atmResp.data
      setAtmStrike(atm_strike)
      setOpenPrice(underlying_open)
      setOpenPriceOverride(String(Math.round(underlying_open)))
      if (!manualStrike) setManualStrike(String(atm_strike))

      // Step 2: Build contract list
      let baseContracts: Contract[] = flushContracts
        ? []
        : contracts.filter(c => c.source === 'manual')

      const keyCE = `${index}_${atm_strike}_CE_${selectedExpiry}`
      const keyPE = `${index}_${atm_strike}_PE_${selectedExpiry}`
      const autoCE: Contract = {
        key: keyCE, index, exchange: options_exchange,
        strike: String(atm_strike), optionType: 'CE',
        expiry: selectedExpiry, expiryDisplay: selectedExpiry,
        source: 'atm', selected: true,
      }
      const autoPE: Contract = {
        key: keyPE, index, exchange: options_exchange,
        strike: String(atm_strike), optionType: 'PE',
        expiry: selectedExpiry, expiryDisplay: selectedExpiry,
        source: 'atm', selected: true,
      }
      baseContracts = [
        ...baseContracts.filter(c => c.source !== 'atm'),
        autoCE,
        autoPE,
      ]
      setContracts(baseContracts)

      if (baseContracts.length === 0) { setChartData([]); setIsLoading(false); return }

      // Step 3: Fetch OHLCV for each contract
      const startDate = formatDateForAPI(selectedDate)
      const endDate = formatDateForAPI(selectedDate)

      const symbolMap: Record<string, string> = {
        [keyCE]: ce_symbol,
        [keyPE]: pe_symbol,
        ...Object.fromEntries(
          baseContracts
            .filter(c => c.source === 'manual')
            .map(c => [c.key, `${c.index}${c.expiry}${c.strike}${c.optionType}`])
        ),
      }

      const promises = baseContracts.map(async c => {
        const symbol = symbolMap[c.key] || `${c.index}${c.expiry}${c.strike}${c.optionType}`
        const resp = await optionsPremiumApi.getContractData({
          symbol,
          exchange: c.exchange,
          interval: '1m',   // always fetch 1m; resample client-side
          start_date: startDate,
          end_date: endDate,
        })
        return { key: c.key, series: resp.data?.series ?? [] }
      })

      const results = await Promise.all(promises)
      if (!isCurrent.valid) return

      const newRaw: Record<string, OHLCVPoint[]> = {}
      for (const r of results) {
        if (r.series.length > 0) newRaw[r.key] = r.series
      }
      setRawDatasetsByKey(newRaw)
    } catch (err) {
      if (isCurrent.valid) setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (isCurrent.valid) setIsLoading(false)
    }
  }, [index, exchange, selectedExpiry, selectedDate, strikeOffset, contracts, flushContracts, manualStrike])

  // ── Reactive Chart Aggregation ───────────────────────────────────────
  // Re-runs instantly when contracts toggled, interval changed, gap toggle changed
  useEffect(() => {
    const activeData = contracts
      .filter(c => c.selected)
      .map(c => rawDatasetsByKey[c.key])
      .filter((d): d is OHLCVPoint[] => d !== undefined && d.length > 0)

    if (activeData.length === 0) { setChartData([]); return }

    const resampled = activeData.map(d => resample(d, intervalMins))
    let combined = aggregateDatasets(resampled)
    if (applySessionGap) combined = removeSessionGap(combined, selectedDate)
    setChartData(combined)
  }, [contracts, rawDatasetsByKey, intervalMins, applySessionGap, selectedDate])

  // ── Live polling: auto-refresh every 60s in live mode ────────────────
  useEffect(() => {
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current)
      liveIntervalRef.current = null
    }

    if (!isLiveMode || !isVisible || contracts.length === 0) return

    liveIntervalRef.current = setInterval(() => {
      const today = todayStr()
      const fetchLatest = async () => {
        try {
          const promises = contracts.filter(c => c.selected).map(async c => {
            const resp = await optionsPremiumApi.getContractData({
              symbol: `${c.index}${c.expiry}${c.strike}${c.optionType}`,
              exchange: c.exchange,
              interval: '1m',
              start_date: today,
              end_date: today,
            })
            return { key: c.key, series: resp.data?.series ?? [] }
          })
          const results = await Promise.all(promises)
          setRawDatasetsByKey(prev => {
            const updated = { ...prev }
            for (const r of results) {
              if (r.series.length > 0) updated[r.key] = r.series
            }
            return updated
          })
        } catch (err) {
          console.warn('[live-poll] failed:', err)
        }
      }
      fetchLatest()
    }, 60_000)

    return () => {
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current)
        liveIntervalRef.current = null
      }
    }
  }, [isLiveMode, isVisible, contracts])

  // ── Add manual contract ──────────────────────────────────────────────
  const handleAddManualContract = useCallback(({ strike, optionType }: { strike: string; optionType: 'CE' | 'PE' }) => {
    if (!strike || !selectedExpiry) return false
    const key = `${index}_${strike}_${optionType}_${selectedExpiry}`
    if (contracts.some(c => c.key === key)) return false
    setContracts(prev => [...prev, {
      key, index, exchange,
      strike, optionType, expiry: selectedExpiry, expiryDisplay: selectedExpiry,
      source: 'manual', selected: true,
    }])
    return true
  }, [index, exchange, selectedExpiry, contracts])

  const handleToggleContract = useCallback((contractKey: string) => {
    setContracts(prev => prev.map(c => c.key === contractKey ? { ...c, selected: !c.selected } : c))
  }, [])

  const handleRemoveContract = useCallback((contractKey: string) => {
    setContracts(prev => prev.filter(c => c.key !== contractKey))
    setRawDatasetsByKey(prev => { const n = { ...prev }; delete n[contractKey]; return n })
  }, [])

  return {
    // Selections
    index, setIndex,
    exchange, setExchange,
    selectedDate, setSelectedDate,
    // Open price
    openPrice, openPriceOverride, setOpenPriceOverride,
    atmStrike,
    // Expiry
    expiries, selectedExpiry, setSelectedExpiry,
    // Manual builder
    manualStrike, setManualStrike,
    manualOptType, setManualOptType,
    strikeOffset, setStrikeOffset,
    // Contracts & chart
    contracts, chartData,
    intervalMins, setIntervalMins,
    isLoading, error,
    flushContracts, setFlushContracts,
    applySessionGap, setApplySessionGap,
    // Live mode
    isLiveMode,
    // Handlers
    handleReload,
    handleAddManualContract,
    handleToggleContract,
    handleRemoveContract,
  }
}
