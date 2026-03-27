"""
beam_solver.py — Simply Supported Beam Solver
==============================================

This file contains all the structural engineering calculations.
It does NOT deal with the website or visuals — it is purely the math engine.

HOW A SIMPLY SUPPORTED BEAM WORKS (quick recap):
  - The beam rests on two supports: A (left) and B (right)
  - Loads push DOWN on the beam at specific positions
  - The two supports push UP to keep the beam in balance (these are called "reactions")
  - We need to find:
      1. How strong each reaction is  (RA and RB)
      2. The Shear Force at every point along the beam  (SFD)
      3. The Bending Moment at every point along the beam  (BMD)

SIGN CONVENTION (the rules for + and - directions):
  - Loads pushing DOWN  → positive
  - Reactions pushing UP → positive
  - Shear Force: positive when left side pushes up
  - Bending Moment: positive when the beam sags (bends like a smile)
"""


def solve(span, loads, n_samples=500):
    """
    This is the main (and only) function in this file.
    You give it the beam length and where the loads are,
    and it gives back everything needed to draw the diagrams.

    INPUTS:
      span      → the total length of the beam in metres (e.g. 10.0)
      loads     → a list of (position, magnitude) pairs, e.g.:
                    [(3.0, 20.0), (7.0, 15.0)]
                  means: a 20 kN load at 3 m, and a 15 kN load at 7 m
      n_samples → how many points to calculate along the beam for smooth curves
                  (500 is plenty — more = smoother but slower)

    OUTPUT:
      a dictionary (a labelled collection of results) containing:
        - reaction_a, reaction_b  : the upward forces at each support
        - sections                : shear + moment at ~500 points (used for graphs)
        - key_sections            : shear + moment at important points only (used for table)
        - max/min shear + moment  : the peak values
    """

    # ══════════════════════════════════════════════════════
    # STEP 1 — CHECK THE INPUTS MAKE SENSE
    # Before doing any math, we make sure the user hasn't
    # entered something impossible (like a zero-length beam).
    # If something is wrong, we stop immediately and explain why.
    # ══════════════════════════════════════════════════════

    if span <= 0:
        raise ValueError("Span must be greater than zero.")
        # "raise ValueError" means: stop everything and show this error message

    if not loads:
        raise ValueError("At least one point load is required.")

    for i, (a, P) in enumerate(loads, 1):
        # Loop through each load and check it individually
        # 'a' is the position along the beam, 'P' is the load magnitude

        if not (0 <= a <= span):
            raise ValueError(f"Load {i}: position {a} m is outside span [0, {span}] m.")
            # The load must sit ON the beam, not beyond either end

        if P == 0:
            raise ValueError(f"Load {i}: magnitude cannot be zero.")
            # A zero load does nothing — probably a mistake

    # ══════════════════════════════════════════════════════
    # STEP 2 — CALCULATE THE SUPPORT REACTIONS (RA and RB)
    #
    # We use two rules of static equilibrium:
    #
    #   Rule 1 — The beam doesn't fly up or sink down:
    #     RA + RB = sum of all loads
    #
    #   Rule 2 — The beam doesn't rotate (take moments about A):
    #     RB × L = P1×a1 + P2×a2 + ...
    #     → RB = (sum of each load × its distance from A) ÷ span
    #     → RA = total load − RB
    # ══════════════════════════════════════════════════════

    total_load = sum(P for _, P in loads)
    # Add up all the load magnitudes to get total downward force

    RB = sum(P * a for a, P in loads) / span
    # Moment equilibrium about A:
    # Each load contributes (magnitude × distance from A)
    # Divide by span to get RB

    RA = total_load - RB
    # Once we know RB, RA is simply the remainder

    # ══════════════════════════════════════════════════════
    # STEP 3 — DEFINE HOW TO CALCULATE V AND M AT ANY POINT
    #
    # Imagine standing at position x on the beam and looking LEFT.
    # Everything to your left is trying to push/rotate the beam.
    #
    # Shear Force V(x):
    #   Start with the left reaction RA pushing up.
    #   Subtract any loads that have already been applied at or before x.
    #   Result: the net vertical force trying to "slide" the beam at x.
    #
    # Bending Moment M(x):
    #   Start with RA acting over the distance x (RA × x).
    #   Subtract the moment each load creates: load × (x − load position).
    #   Only include loads that are at or before x.
    #   Result: the net turning force trying to "bend" the beam at x.
    #
    # These are written as nested functions (closures) so they can
    # directly use RA and loads without needing to pass them every time.
    # ══════════════════════════════════════════════════════

    def V(x):
        # Shear force at position x
        return RA - sum(P for a, P in loads if a <= x + 1e-9)
        # Note: "a <= x + 1e-9" means "a is at or just before x"
        # The tiny 1e-9 (0.000000001) handles floating point rounding —
        # without it, a load sitting exactly at x might be missed

    def M(x):
        # Bending moment at position x
        return RA * x - sum(P * (x - a) for a, P in loads if a <= x + 1e-9)
        # Each load contributes: magnitude × (how far x is past the load)

    # ══════════════════════════════════════════════════════
    # STEP 4 — CHOOSE WHERE TO CALCULATE ALONG THE BEAM
    #
    # We need to evaluate V and M at many x positions to draw smooth graphs.
    # We use two strategies together:
    #
    #   a) Evenly spaced points  (e.g. every 0.02 m for a 10 m beam)
    #      → gives smooth curves between loads
    #
    #   b) Points just before and after each load  (±0.000001 m)
    #      → this is CRITICAL because shear force jumps suddenly at a load.
    #        If we don't sample right at the jump, the graph looks wrong.
    #        Think of it like zooming in on a cliff edge to show the drop.
    # ══════════════════════════════════════════════════════

    xs = set()
    # A "set" automatically removes duplicate values

    for i in range(n_samples + 1):
        xs.add(round(i * span / n_samples, 10))
    # Evenly spaced x values from 0 to span

    for a, _ in loads:
        xs.update(
            {
                max(0, a - 1e-6),  # just before the load
                a,  # exactly at the load
                min(span, a + 1e-6),  # just after the load
            }
        )
    # Add bracketing points around every load position

    xs = sorted(x for x in xs if 0 <= x <= span)
    # Sort numerically and remove anything outside the beam

    # ══════════════════════════════════════════════════════
    # STEP 5 — COMPUTE V AND M AT EVERY CHOSEN POINT
    #
    # Now we simply call V(x) and M(x) for every x in our list.
    # This produces the data arrays used to draw the SFD and BMD graphs.
    # ══════════════════════════════════════════════════════

    sections = [
        {"x": round(x, 6), "shear": round(V(x), 6), "moment": round(M(x), 6)}
        for x in xs
    ]
    # List comprehension: one dictionary per x position
    # round(..., 6) keeps 6 decimal places — avoids very long floats

    # ══════════════════════════════════════════════════════
    # STEP 6 — KEY SECTIONS (for the results table)
    #
    # The full 500-point dataset is great for graphs but too much to show
    # in a table. Instead, we pick only the "interesting" positions:
    #   - x = 0         (support A)
    #   - x = span      (support B)
    #   - x = span/2    (midspan — often where max moment occurs)
    #   - just before and after each load  (where shear jumps)
    # ══════════════════════════════════════════════════════

    key_xs = sorted(
        # include supports and positions around each load
        {0.0, span}
        | {max(0, a - 1e-6) for a, _ in loads}  # just before each load
        | {a for a, _ in loads}  # exactly at each load
        | {min(span, a + 1e-6) for a, _ in loads}  # just after each load
    )
    # The "|" operator merges sets together (like a union in maths)

    key_sections = [{"x": x, "shear": V(x), "moment": M(x)} for x in key_xs]

    # ══════════════════════════════════════════════════════
    # STEP 7 — FIND THE PEAK VALUES
    #
    # Simply scan through all computed shear and moment values
    # and pick the largest and smallest.
    # These are displayed as the "Max / Min" chips on the dashboard.
    # ══════════════════════════════════════════════════════

    shears = [s["shear"] for s in sections]
    moments = [s["moment"] for s in sections]

    # ══════════════════════════════════════════════════════
    # STEP 8 — PACKAGE AND RETURN EVERYTHING
    #
    # We bundle all results into one dictionary and return it.
    # app.py will receive this and send it to the browser as JSON.
    # ══════════════════════════════════════════════════════

    return {
        "span": span,
        "reaction_a": round(RA, 4),
        "reaction_b": round(RB, 4),
        "max_shear": round(max(shears), 4),
        "min_shear": round(min(shears), 4),
        "max_moment": round(max(moments), 4),
        "min_moment": round(min(moments), 4),
        "loads": [{"position": a, "magnitude": P} for a, P in loads],
        "sections": sections,  # ~500 points  → used for graphs
        "key_sections": key_sections,  # ~10 points   → used for table
    }


# ══════════════════════════════════════════════════════════
# QUICK TEST — runs only when you execute this file directly
#
# Type in your terminal:  python beam_solver.py
# It will solve a simple example and print the results.
# This is useful to verify the math without running the website.
# ══════════════════════════════════════════════════════════

if __name__ == "__main__":
    result = solve(span=10.0, loads=[(3.0, 20.0), (7.0, 15.0)])

    print(f"RA = {result['reaction_a']} kN")
    print(f"RB = {result['reaction_b']} kN")
    print(f"Max Shear  = {result['max_shear']} kN")
    print(f"Max Moment = {result['max_moment']} kN·m")
    print(f"\n{'x (m)':>8}  {'V (kN)':>10}  {'M (kN·m)':>12}")
    print("-" * 36)
    for s in result["key_sections"]:
        print(f"{s['x']:>8.3f}  {s['shear']:>10.3f}  {s['moment']:>12.3f}")
