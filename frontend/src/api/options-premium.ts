// ─── options-premium.ts ───────────────────────────────────────────────────
// API interface for the Options Premium Chart.
// Connects to the /optionspremium backend blueprint.

export interface OHLCVPoint {
  date: number   // ms timestamp (for amCharts GaplessDateAxis)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface ResolvedATM {
  underlying: string
  underlying_ltp: number
  underlying_open: number
  atm_strike: number
  target_strike: number
  strike_offset: number
  ce_symbol: string
  pe_symbol: string
  options_exchange: string
}

export interface ResolveATMParams {
  underlying: string
  exchange: string
  expiry_date: string
  strike_offset: number
}

export interface ContractDataParams {
  symbol: string
  exchange: string
  interval: string
  start_date: string
  end_date: string
}

async function fetchWithSession(url: string, options: RequestInit = {}): Promise<Response> {
  const csrfResp = await fetch('/auth/csrf-token', { credentials: 'include' })
  const csrfData = await csrfResp.json()
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrfData.csrf_token,
      ...(options.headers || {}),
    },
  })
}

export const optionsPremiumApi = {
  /**
   * Resolve ATM CE/PE symbols from live underlying quote + strike offset.
   */
  async resolveATM(params: ResolveATMParams): Promise<{ status: string; data?: ResolvedATM; message?: string }> {
    const resp = await fetchWithSession('/optionspremium/api/resolve-atm', {
      method: 'POST',
      body: JSON.stringify(params),
    })
    return resp.json()
  },

  /**
   * Fetch OHLCV history for a single option contract.
   * Returns timestamps in milliseconds for amCharts compatibility.
   */
  async getContractData(params: ContractDataParams): Promise<{ status: string; data?: { symbol: string; series: OHLCVPoint[] }; message?: string }> {
    const resp = await fetchWithSession('/optionspremium/api/contract-data', {
      method: 'POST',
      body: JSON.stringify(params),
    })
    return resp.json()
  },

  /**
   * Get broker-supported intervals.
   */
  async getIntervals(): Promise<{ status: string; data?: string[]; message?: string }> {
    const resp = await fetchWithSession('/optionspremium/api/intervals', { method: 'GET' })
    return resp.json()
  },
}
