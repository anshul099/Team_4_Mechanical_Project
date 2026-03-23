"""
app.py
======
Flask REST API server for the BeamSolve frontend.

Endpoints
---------
POST /api/solve
    Body  : { "span": float, "loads": [{"position": float, "magnitude": float}, ...] }
    Return: BeamResult as JSON  (200)  or  { "error": "..." }  (400)

GET /
    Serves index.html

Run
---
    pip install flask flask-cors
    python app.py
    # → http://localhost:5000
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os

from beam_solver import solve

# ── Flask setup ──────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
CORS(app)  # allow the HTML file to call the API from any origin


# ── Routes ───────────────────────────────────────────────────────────────────


@app.route("/")
def index():
    """Serve the main HTML page."""
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/api/solve", methods=["POST"])
def api_solve():
    """
    Analyse the beam and return reactions + SFD/BMD data.

    Expected JSON body
    ------------------
    {
        "span": 10.0,
        "loads": [
            {"position": 3.0, "magnitude": 20.0},
            {"position": 7.0, "magnitude": 15.0}
        ]
    }
    """
    data = request.get_json(silent=True)

    if not data:
        return jsonify({"error": "Invalid or missing JSON body."}), 400

    # ── Parse span ──────────────────────────────────────
    try:
        span = float(data["span"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Field 'span' must be a positive number."}), 400

    # ── Parse loads ─────────────────────────────────────
    raw_loads = data.get("loads", [])
    if not isinstance(raw_loads, list):
        return jsonify({"error": "Field 'loads' must be an array."}), 400

    loads = []
    for i, item in enumerate(raw_loads, start=1):
        try:
            pos = float(item["position"])
            mag = float(item["magnitude"])
            loads.append((pos, mag))
        except (KeyError, TypeError, ValueError):
            return (
                jsonify(
                    {
                        "error": f"Load {i}: each load needs numeric 'position' and 'magnitude'."
                    }
                ),
                400,
            )

    # ── Solve ────────────────────────────────────────────
    try:
        result = solve(span=span, loads=loads)
        return jsonify(result), 200

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    except Exception as exc:
        app.logger.exception("Unexpected error during solve")
        return jsonify({"error": f"Internal server error: {exc}"}), 500


@app.route("/api/health", methods=["GET"])
def health():
    """Quick liveness check."""
    return jsonify({"status": "ok", "service": "BeamSolve API"}), 200


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 50)
    print("  BeamSolve API  →  http://localhost:5000")
    print("  Press Ctrl+C to stop")
    print("=" * 50)
    app.run(debug=True, host="0.0.0.0", port=5000)
