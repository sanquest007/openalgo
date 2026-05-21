"""
Options Premium Service
Resolves ATM contracts and fetches OHLCV history for option symbols.

Provides two main functions:
- resolve_atm_contracts: Finds CE/PE symbols from live quotes + strike offset
- get_contract_ohlcv: Fetches OHLCV history for a single option symbol,
  returning timestamps in milliseconds (required by amCharts GaplessDateAxis)
"""

import pytz
import pandas as pd
from datetime import datetime

from services.history_service import get_history
from services.option_symbol_service import (
    construct_crypto_option_symbol,
    construct_option_symbol,
    find_atm_strike_from_actual,
    get_available_strikes,
    get_option_exchange,
)
from services.quotes_service import get_quotes
from database.token_db_enhanced import fno_search_symbols
from utils.constants import CRYPTO_EXCHANGES, INSTRUMENT_PERPFUT
from utils.logging import get_logger

logger = get_logger(__name__)

# Index symbols that need NSE_INDEX/BSE_INDEX for quotes
NSE_INDEX_SYMBOLS = {
    "NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY",
    "NIFTYNXT50", "NIFTYIT", "NIFTYPHARMA", "NIFTYBANK",
}
BSE_INDEX_SYMBOLS = {"SENSEX", "BANKEX", "SENSEX50"}


def _get_quote_exchange(base_symbol: str, underlying_exchange: str) -> str:
    """Determine the exchange to use for fetching underlying quotes."""
    if base_symbol in NSE_INDEX_SYMBOLS:
        return "NSE_INDEX"
    if base_symbol in BSE_INDEX_SYMBOLS:
        return "BSE_INDEX"
    if underlying_exchange.upper() in ("NFO", "BFO"):
        return "NSE" if underlying_exchange.upper() == "NFO" else "BSE"
    if underlying_exchange.upper() in CRYPTO_EXCHANGES:
        return underlying_exchange.upper()
    return underlying_exchange.upper()


def _convert_timestamp_to_ms(df: pd.DataFrame) -> pd.DataFrame | None:
    """
    Convert the 'timestamp' column to milliseconds and set as 'date' column.
    amCharts GaplessDateAxis requires millisecond timestamps.
    """
    ist = pytz.timezone("Asia/Kolkata")
    try:
        if "timestamp" not in df.columns:
            logger.warning("No timestamp field found in history data")
            return None

        # Try as Unix timestamp (seconds)
        try:
            df["datetime"] = pd.to_datetime(df["timestamp"], unit="s", utc=True)
            df["datetime"] = df["datetime"].dt.tz_convert(ist)
        except Exception:
            try:
                df["datetime"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
                df["datetime"] = df["datetime"].dt.tz_convert(ist)
            except Exception:
                df["datetime"] = pd.to_datetime(df["timestamp"])
                if df["datetime"].dt.tz is None:
                    df["datetime"] = df["datetime"].dt.tz_localize("UTC").dt.tz_convert(ist)
                else:
                    df["datetime"] = df["datetime"].dt.tz_convert(ist)

        # Convert to milliseconds for amCharts
        df["date"] = df["datetime"].astype("int64") // 1_000_000
        df.set_index("datetime", inplace=True)
        df = df.sort_index()
        return df
    except Exception as e:
        logger.warning(f"Error converting timestamps: {e}")
        return None


def resolve_atm_contracts(
    underlying: str,
    exchange: str,
    expiry_date: str,
    strike_offset: int,
    api_key: str,
) -> tuple[bool, dict, int]:
    """
    Resolve ATM CE/PE symbols using live quote data.

    Args:
        underlying: Underlying symbol (e.g., "NIFTY")
        exchange: Exchange (e.g., "NFO")
        expiry_date: Expiry in DDMMMYY format (e.g., "06FEB26")
        strike_offset: Offset from ATM (-10 to +20). Positive = higher strike.
        api_key: OpenAlgo API key

    Returns:
        Tuple of (success, response_dict, status_code)
    """
    try:
        base_symbol = underlying.upper()
        quote_exchange = _get_quote_exchange(base_symbol, exchange)
        options_exchange = get_option_exchange(quote_exchange)

        # Handle crypto: look up perpetual symbol
        if exchange.upper() in CRYPTO_EXCHANGES:
            _perp = fno_search_symbols(
                query=f"{base_symbol}USDFUT", exchange=exchange,
                instrumenttype=INSTRUMENT_PERPFUT, limit=1
            )
            if not _perp:
                return (
                    False,
                    {"status": "error", "message": f"No perpetual futures found for {base_symbol} on {exchange}"},
                    404,
                )
            underlying_quote_symbol = _perp[0]["symbol"]
        else:
            underlying_quote_symbol = base_symbol

        # Fetch live quote for underlying (gives us LTP + open price)
        success, quote_resp, status_code = get_quotes(
            symbol=underlying_quote_symbol,
            exchange=quote_exchange,
            api_key=api_key,
        )
        if not success:
            return (
                False,
                {"status": "error", "message": f"Failed to fetch underlying quote: {quote_resp.get('message', 'Unknown error')}"},
                status_code,
            )

        quote_data = quote_resp.get("data", {})
        underlying_ltp = quote_data.get("ltp", 0)
        underlying_open = quote_data.get("open", underlying_ltp)

        if not underlying_ltp:
            return False, {"status": "error", "message": "Could not get underlying LTP"}, 400

        # Get available strikes for the expiry
        available_strikes = get_available_strikes(
            base_symbol, expiry_date.upper(), "CE", options_exchange
        )
        if not available_strikes:
            return (
                False,
                {"status": "error", "message": f"No strikes found for {base_symbol} {expiry_date} on {options_exchange}"},
                404,
            )

        sorted_strikes = sorted(available_strikes)

        # Find ATM strike from LTP
        atm_strike = find_atm_strike_from_actual(underlying_ltp, available_strikes)
        if atm_strike is None:
            return False, {"status": "error", "message": "Could not determine ATM strike"}, 400

        # Apply strike offset (as index step in sorted strikes)
        atm_index = sorted_strikes.index(atm_strike) if atm_strike in sorted_strikes else len(sorted_strikes) // 2
        target_index = max(0, min(len(sorted_strikes) - 1, atm_index + strike_offset))
        target_strike = sorted_strikes[target_index]

        # Build CE/PE symbols
        _build_sym = construct_crypto_option_symbol if exchange.upper() in CRYPTO_EXCHANGES else construct_option_symbol
        ce_symbol = _build_sym(base_symbol, expiry_date.upper(), target_strike, "CE")
        pe_symbol = _build_sym(base_symbol, expiry_date.upper(), target_strike, "PE")

        return (
            True,
            {
                "status": "success",
                "data": {
                    "underlying": base_symbol,
                    "underlying_ltp": round(float(underlying_ltp), 2),
                    "underlying_open": round(float(underlying_open), 2),
                    "atm_strike": atm_strike,
                    "target_strike": target_strike,
                    "strike_offset": strike_offset,
                    "ce_symbol": ce_symbol,
                    "pe_symbol": pe_symbol,
                    "options_exchange": options_exchange,
                },
            },
            200,
        )

    except Exception as e:
        logger.exception(f"Error resolving ATM contracts: {e}")
        return False, {"status": "error", "message": str(e)}, 500


def get_contract_ohlcv(
    symbol: str,
    exchange: str,
    interval: str,
    start_date: str,
    end_date: str,
    api_key: str,
) -> tuple[bool, dict, int]:
    """
    Fetch OHLCV history for a single option contract.

    Returns timestamps in milliseconds for amCharts compatibility.

    Args:
        symbol: Option symbol (e.g., "NIFTY06FEB2624350CE")
        exchange: Options exchange (e.g., "NFO")
        interval: Candle interval (e.g., "1m", "5m")
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
        api_key: OpenAlgo API key

    Returns:
        Tuple of (success, response_dict, status_code)
    """
    try:
        success, resp, status_code = get_history(
            symbol=symbol,
            exchange=exchange,
            interval=interval,
            start_date=start_date,
            end_date=end_date,
            api_key=api_key,
        )

        if not success:
            return (
                False,
                {"status": "error", "message": f"Failed to fetch history: {resp.get('message', 'Unknown error')}"},
                status_code,
            )

        raw_data = resp.get("data", [])
        if not raw_data:
            return True, {"status": "success", "data": {"symbol": symbol, "series": []}}, 200

        df = pd.DataFrame(raw_data)
        df = _convert_timestamp_to_ms(df)
        if df is None:
            return False, {"status": "error", "message": "Failed to parse timestamps"}, 500

        series = []
        for _, row in df.iterrows():
            try:
                series.append({
                    "date": int(row["date"]),            # ms timestamp for amCharts
                    "open": round(float(row["open"]), 2),
                    "high": round(float(row["high"]), 2),
                    "low": round(float(row["low"]), 2),
                    "close": round(float(row["close"]), 2),
                    "volume": int(row.get("volume", 0)),
                })
            except (KeyError, ValueError, TypeError):
                continue

        return (
            True,
            {
                "status": "success",
                "data": {
                    "symbol": symbol,
                    "exchange": exchange,
                    "interval": interval,
                    "series": series,
                },
            },
            200,
        )

    except Exception as e:
        logger.exception(f"Error fetching contract OHLCV: {e}")
        return False, {"status": "error", "message": str(e)}, 500
