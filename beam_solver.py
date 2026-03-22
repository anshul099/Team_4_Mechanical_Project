"""
beam_solver.py
==============
Core structural mechanics engine for a simply supported beam
subjected to multiple point loads at arbitrary positions.

Equations used
--------------
Equilibrium:
    ΣFy = 0  →  RA + RB = ΣPi
    ΣM_A = 0 →  RB = Σ(Pi * ai) / L

Shear Force at section x:
    V(x) = RA - Σ Pi  for all ai ≤ x

Bending Moment at section x:
    M(x) = RA·x - Σ Pi·(x − ai)  for all ai ≤ x

Sign Convention
---------------
    Loads   : downward positive (standard structural)
    Reactions : upward positive
    Shear   : positive when left face has upward force
    Moment  : positive (sagging) when beam bends concave upward
"""

from dataclasses import dataclass, field
from typing import List, Tuple
import math


# ─────────────────────────────────────────────
#  Data classes
# ─────────────────────────────────────────────

@dataclass
class PointLoad:
    """A single point load applied to the beam."""
    position: float   # metres from left support A
    magnitude: float  # kN, positive = downward


@dataclass
class BeamInput:
    """Full problem definition."""
    span: float                          # total span L (m)
    loads: List[PointLoad] = field(default_factory=list)
    num_sections: int = 500              # sampling density for diagrams


@dataclass
class SectionResult:
    """Results at a single cross-section."""
    x: float           # position (m)
    shear: float       # shear force V (kN)
    moment: float      # bending moment M (kN·m)


@dataclass
class BeamResult:
    """Complete analysis output."""
    span: float
    reaction_a: float              # RA (kN)
    reaction_b: float              # RB (kN)
    sections: List[SectionResult]  # dense curve data
    key_sections: List[SectionResult]  # only critical positions
    max_shear: float
    min_shear: float
    max_moment: float
    min_moment: float
    loads: List[PointLoad]


# ─────────────────────────────────────────────
#  Validation
# ─────────────────────────────────────────────

class BeamSolverError(ValueError):
    """Raised when beam input is invalid."""
    pass


def validate(beam: BeamInput) -> None:
    """Raise BeamSolverError if any input constraint is violated."""
    if beam.span <= 0:
        raise BeamSolverError("Span length must be greater than zero.")
    if not beam.loads:
        raise BeamSolverError("At least one point load is required.")
    for i, load in enumerate(beam.loads, start=1):
        if load.position < 0 or load.position > beam.span:
            raise BeamSolverError(
                f"Load {i}: position {load.position} m is outside "
                f"the span [0, {beam.span}] m."
            )
        if load.magnitude == 0:
            raise BeamSolverError(f"Load {i}: magnitude cannot be zero.")


# ─────────────────────────────────────────────
#  Core solver
# ─────────────────────────────────────────────

def _shear_at(x: float, ra: float, loads: List[PointLoad]) -> float:
    """Compute shear force at position x."""
    v = ra
    for load in loads:
        if load.position <= x + 1e-9:
            v -= load.magnitude
    return v


def _moment_at(x: float, ra: float, loads: List[PointLoad]) -> float:
    """Compute bending moment at position x."""
    m = ra * x
    for load in loads:
        if load.position <= x + 1e-9:
            m -= load.magnitude * (x - load.position)
    return m


def solve(beam: BeamInput) -> BeamResult:
    """
    Analyse the simply supported beam and return full results.

    Parameters
    ----------
    beam : BeamInput
        Validated beam definition.

    Returns
    -------
    BeamResult
        Reactions, SFD/BMD arrays, and key-section table.
    """
    validate(beam)

    L = beam.span
    loads = beam.loads

    # ── Reactions ──────────────────────────────────────
    total_load = sum(ld.magnitude for ld in loads)
    rb = sum(ld.magnitude * ld.position for ld in loads) / L
    ra = total_load - rb

    # ── Build dense x-axis (captures jumps at load points) ──
    critical_xs: set = {0.0, L}
    for ld in loads:
        # Bracket each load with epsilon positions to capture step change
        eps = 1e-6
        critical_xs.update({
            max(0.0, ld.position - eps),
            ld.position,
            min(L, ld.position + eps),
        })

    # Evenly-spaced samples for smooth curves
    step = L / beam.num_sections
    for i in range(beam.num_sections + 1):
        critical_xs.add(round(i * step, 10))

    xs = sorted(x for x in critical_xs if 0.0 <= x <= L)

    # ── Compute SFD / BMD ──────────────────────────────
    sections: List[SectionResult] = []
    for x in xs:
        sections.append(SectionResult(
            x=round(x, 6),
            shear=round(_shear_at(x, ra, loads), 6),
            moment=round(_moment_at(x, ra, loads), 6),
        ))

    # ── Key sections (for table) ────────────────────────
    key_xs_set: set = {0.0, L, round(L / 2, 6)}
    for ld in loads:
        key_xs_set.update({
            max(0.0, ld.position - 1e-6),
            ld.position,
            min(L, ld.position + 1e-6),
        })

    key_sections: List[SectionResult] = []
    for x in sorted(key_xs_set):
        key_sections.append(SectionResult(
            x=round(x, 4),
            shear=round(_shear_at(x, ra, loads), 4),
            moment=round(_moment_at(x, ra, loads), 4),
        ))

    # ── Extremes ────────────────────────────────────────
    shears  = [s.shear  for s in sections]
    moments = [s.moment for s in sections]

    return BeamResult(
        span=L,
        reaction_a=round(ra, 4),
        reaction_b=round(rb, 4),
        sections=sections,
        key_sections=key_sections,
        max_shear=round(max(shears), 4),
        min_shear=round(min(shears), 4),
        max_moment=round(max(moments), 4),
        min_moment=round(min(moments), 4),
        loads=loads,
    )


# ─────────────────────────────────────────────
#  Serialisation helpers
# ─────────────────────────────────────────────

def result_to_dict(result: BeamResult) -> dict:
    """Convert BeamResult to a JSON-serialisable dictionary."""
    return {
        "span": result.span,
        "reaction_a": result.reaction_a,
        "reaction_b": result.reaction_b,
        "max_shear": result.max_shear,
        "min_shear": result.min_shear,
        "max_moment": result.max_moment,
        "min_moment": result.min_moment,
        "loads": [
            {"position": ld.position, "magnitude": ld.magnitude}
            for ld in result.loads
        ],
        "sections": [
            {"x": s.x, "shear": s.shear, "moment": s.moment}
            for s in result.sections
        ],
        "key_sections": [
            {"x": s.x, "shear": s.shear, "moment": s.moment}
            for s in result.key_sections
        ],
    }


# ─────────────────────────────────────────────
#  Quick CLI test
# ─────────────────────────────────────────────

if __name__ == "__main__":
    beam = BeamInput(
        span=10.0,
        loads=[
            PointLoad(position=3.0, magnitude=20.0),
            PointLoad(position=7.0, magnitude=15.0),
        ],
    )
    res = solve(beam)
    print(f"RA = {res.reaction_a} kN")
    print(f"RB = {res.reaction_b} kN")
    print(f"Max Shear  = {res.max_shear} kN")
    print(f"Max Moment = {res.max_moment} kN·m")
    print("\nKey sections:")
    print(f"{'x (m)':>8}  {'V (kN)':>10}  {'M (kN·m)':>12}")
    print("-" * 36)
    for s in res.key_sections:
        print(f"{s.x:>8.3f}  {s.shear:>10.3f}  {s.moment:>12.3f}")
