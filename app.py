"""
app.py
======
This file is the server (middleman) for the BeamSolve application.
It sits between the website (index.html) and the math engine (beam_solver.py).

What it does:
  - Serves the website when someone opens http://localhost:5000
  - Listens for beam analysis requests from the browser
  - Passes those requests to beam_solver.py
  - Sends the results back to the browser as JSON data

How to run:
  pip install flask flask-cors
  python app.py
  Then open http://localhost:5000 in your browser
"""

# ── Imports ───────────────────────────────────────────────────────────────────
# Flask    : the web framework that turns this Python file into a web server
# request  : lets us read data sent from the browser (the beam inputs)
# jsonify  : converts Python dictionaries into JSON format the browser can read
# send_from_directory : sends a file (like index.html) to the browser
from flask import Flask, request, jsonify, send_from_directory

# CORS : allows the browser to contact this server even if the page was opened
#        from a different address. Without this, the browser blocks the request.
from flask_cors import CORS

# os : used to find the folder where this file lives on the computer
import os

# Import the solve() function from our structural mechanics engine
# This is the only function we need from beam_solver.py
from beam_solver import solve


# ── Flask Application Setup ───────────────────────────────────────────────────

# Find the absolute path of the folder containing this file
# e.g. C:\Users\YourName\BeamSolve
# This is used so Flask knows where to find index.html and other files
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Create the Flask application object
# __name__     : tells Flask the name of this module (used internally)
# static_folder: the folder where static files (html, css, js) are stored
# static_url_path: makes static files accessible at the root URL "/"
app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")

# Enable CORS (Cross-Origin Resource Sharing) for all routes
# This allows the browser to send fetch() requests to /api/solve
# without getting blocked by browser security policies
CORS(app)


# ── Route: Serve the Website ──────────────────────────────────────────────────


@app.route("/")  # This decorator tells Flask: "run this function when someone visits /"
def index():
    # Send the index.html file to the browser
    # The browser then loads style.css and main.js automatically
    return send_from_directory(BASE_DIR, "index.html")


# ── Route: Beam Analysis API ──────────────────────────────────────────────────


@app.route("/api/solve", methods=["POST"])  # Only accepts POST requests (sending data)
def api_solve():
    """
    This is the main API endpoint. The browser sends beam data here,
    and this function returns the full analysis results.

    The browser sends JSON data like this:
    {
        "span": 10.0,
        "loads": [
            {"position": 3.0, "magnitude": 20.0},
            {"position": 7.0, "magnitude": 15.0}
        ]
    }
    """

    # Read the JSON data sent by the browser
    # silent=True means: if the data is not valid JSON, return None instead of crashing
    data = request.get_json(silent=True)

    # If no data was received or it wasn't valid JSON, stop and return an error
    if not data:
        return jsonify({"error": "Invalid or missing JSON body."}), 400
        # 400 is the HTTP status code for "Bad Request" (something wrong with what was sent)

    # ── Step 1: Extract the span length ───────────────────────────────────────
    try:
        span = float(
            data["span"]
        )  # Read "span" from the JSON and convert to a decimal number
    except (KeyError, TypeError, ValueError):
        # KeyError   : "span" key was missing from the JSON
        # TypeError  : value was not a number type at all
        # ValueError : value could not be converted to float (e.g. was a word)
        return jsonify({"error": "Field 'span' must be a positive number."}), 400

    # ── Step 2: Extract the loads list ────────────────────────────────────────
    raw_loads = data.get(
        "loads", []
    )  # Get "loads" from JSON, default to empty list if missing

    # Make sure loads is actually a list (not a single number or a string)
    if not isinstance(raw_loads, list):
        return jsonify({"error": "Field 'loads' must be an array."}), 400

    loads = []  # This will hold the cleaned (position, magnitude) tuples

    # Loop through each load entry sent by the browser
    # enumerate starts counting from 1 so error messages say "Load 1", "Load 2" etc.
    for i, item in enumerate(raw_loads, start=1):
        try:
            pos = float(
                item["position"]
            )  # Extract position in metres, convert to float
            mag = float(item["magnitude"])  # Extract magnitude in kN, convert to float
            loads.append((pos, mag))  # Store as a tuple (position, magnitude)
        except (KeyError, TypeError, ValueError):
            # If any load is missing position/magnitude or has invalid values, stop
            return (
                jsonify(
                    {
                        "error": f"Load {i}: each load needs numeric 'position' and 'magnitude'."
                    }
                ),
                400,
            )

    # ── Step 3: Run the structural analysis ───────────────────────────────────
    try:
        # Call the solve() function from beam_solver.py with the parsed inputs
        # It returns a dictionary containing reactions, SFD data, BMD data, etc.
        result = solve(span=span, loads=loads)

        # Send the result back to the browser as JSON with HTTP 200 (success)
        return jsonify(result), 200

    except ValueError as exc:
        # beam_solver.py raises ValueError for things like:
        # - span is zero or negative
        # - a load is outside the beam span
        # Send the error message back to the browser so it can display it
        return jsonify({"error": str(exc)}), 400

    except Exception as exc:
        # Catch any other unexpected errors (bugs, crashes)
        # Log the full error details to the terminal for debugging
        app.logger.exception("Unexpected error during solve")
        # Send a generic error message to the browser
        return jsonify({"error": f"Internal server error: {exc}"}), 500


# ── Route: Health Check ───────────────────────────────────────────────────────


@app.route("/api/health", methods=["GET"])  # Accepts GET requests (just fetching info)
def health():
    # A simple check to confirm the server is running
    # Returns {"status": "ok"} — useful for testing if the server is alive
    return jsonify({"status": "ok", "service": "BeamSolve API"}), 200


# ── Entry Point ───────────────────────────────────────────────────────────────

# This block only runs when you execute: python app.py
# It does NOT run when app.py is imported by another file
if __name__ == "__main__":
    # Print a welcome message in the terminal so the user knows the server started
    print("=" * 50)
    print("  BeamSolve API  →  http://localhost:5000")
    print("  Press Ctrl+C to stop")
    print("=" * 50)

    # Start the Flask server with these settings:
    # debug=True  : automatically restarts the server when you save changes to the code
    # host="0.0.0.0": makes the server accessible on all network interfaces
    # port=5000   : the port number (http://localhost:5000)
    app.run(debug=True, host="0.0.0.0", port=5000)
