"""
Options Premium Chart Blueprint
Serves OHLCV contract data and ATM resolution for the Options Premium Chart.
"""

from flask import Blueprint, jsonify, request, session
from flask_cors import cross_origin

from database.auth_db import get_api_key_for_tradingview, get_auth_token
from services.intervals_service import get_intervals
from services.options_premium_service import get_contract_ohlcv, resolve_atm_contracts
from utils.logging import get_logger
from utils.session import check_session_validity

logger = get_logger(__name__)

options_premium_bp = Blueprint("options_premium_bp", __name__, url_prefix="/")


@options_premium_bp.route("/optionspremium/api/resolve-atm", methods=["POST"])
@cross_origin()
@check_session_validity
def resolve_atm():
    """Resolve ATM CE/PE symbols and underlying quote from live data."""
    try:
        broker = session.get("broker")
        if not broker:
            return jsonify({"status": "error", "message": "Broker not set in session"}), 400

        login_username = session["user"]
        auth_token = get_auth_token(login_username)
        if auth_token is None:
            return jsonify({"status": "error", "message": "Authentication required"}), 401

        api_key = get_api_key_for_tradingview(login_username)
        if not api_key:
            return jsonify(
                {"status": "error", "message": "API key not configured. Please generate an API key in /apikey"}
            ), 401

        data = request.get_json(silent=True) or {}
        underlying = data.get("underlying", "").strip()
        exchange = data.get("exchange", "").strip()
        expiry_date = data.get("expiry_date", "").strip()
        strike_offset = int(data.get("strike_offset", 0))

        if not underlying or not exchange or not expiry_date:
            return jsonify(
                {"status": "error", "message": "underlying, exchange, and expiry_date are required"}
            ), 400

        success, response, status_code = resolve_atm_contracts(
            underlying=underlying,
            exchange=exchange,
            expiry_date=expiry_date,
            strike_offset=strike_offset,
            api_key=api_key,
        )

        return jsonify(response), status_code

    except Exception as e:
        logger.exception(f"Error in resolve-atm API: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@options_premium_bp.route("/optionspremium/api/contract-data", methods=["POST"])
@cross_origin()
@check_session_validity
def contract_data():
    """Fetch full OHLCV history for a single option contract (CE or PE)."""
    try:
        broker = session.get("broker")
        if not broker:
            return jsonify({"status": "error", "message": "Broker not set in session"}), 400

        login_username = session["user"]
        auth_token = get_auth_token(login_username)
        if auth_token is None:
            return jsonify({"status": "error", "message": "Authentication required"}), 401

        api_key = get_api_key_for_tradingview(login_username)
        if not api_key:
            return jsonify(
                {"status": "error", "message": "API key not configured. Please generate an API key in /apikey"}
            ), 401

        data = request.get_json(silent=True) or {}
        symbol = data.get("symbol", "").strip()
        exchange = data.get("exchange", "").strip()
        interval = data.get("interval", "1m").strip()
        start_date = data.get("start_date", "").strip()
        end_date = data.get("end_date", "").strip()

        if not symbol or not exchange or not start_date or not end_date:
            return jsonify(
                {"status": "error", "message": "symbol, exchange, start_date, and end_date are required"}
            ), 400

        success, response, status_code = get_contract_ohlcv(
            symbol=symbol,
            exchange=exchange,
            interval=interval,
            start_date=start_date,
            end_date=end_date,
            api_key=api_key,
        )

        return jsonify(response), status_code

    except Exception as e:
        logger.exception(f"Error in contract-data API: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@options_premium_bp.route("/optionspremium/api/intervals", methods=["GET"])
@cross_origin()
@check_session_validity
def options_premium_intervals():
    """Get broker-supported intervals for the options premium chart."""
    try:
        login_username = session.get("user")
        if not login_username:
            return jsonify({"status": "error", "message": "Authentication required"}), 401

        api_key = get_api_key_for_tradingview(login_username)
        if not api_key:
            return jsonify({"status": "error", "message": "API key not configured"}), 401

        success, response, status_code = get_intervals(api_key=api_key)
        return jsonify(response), status_code

    except Exception as e:
        logger.exception(f"Error fetching intervals: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
