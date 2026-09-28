#!/usr/bin/env python3
"""
Generate a synthetic 3.5-year freediving training dataset (STA full-lung + RV
series) for the Overdive app, as a multi-tab Excel workbook.

Design notes (see "Example data set.md" in this folder for the full brief):

  * Data-oriented: pure config + pure builder functions produce plain row dicts;
    the only side effect (openpyxl writing) lives in `write_workbook` at the end.
  * Deterministic: a fixed RNG seed means re-running reproduces the file exactly.
  * Periodisation: 2 cycles/year, bulk of each cycle at 65-85% of the PREVIOUS
    cycle's PB, final 10 days peaking up to/above PB. Between cycles = light
    maintenance (~1 RV + 1 FL / week @ ~75%). 2026 is maintenance-only.
  * Biometrics mirror the app's Dry RV Table / Static Max routines: min SpO2,
    time below SpO2 thresholds (70/60/50/40%), min HR, contraction onset.

Run:  python3 generate_dataset.py
Out:  overdive_training_dataset.xlsx
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

from openpyxl import Workbook
from openpyxl.chart import LineChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

SEED = 20260628
OUT_FILE = "overdive_training_dataset.xlsx"

# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def mmss(seconds: Optional[float]) -> str:
    """Format seconds as mm:ss (e.g. 8:31 -> '08:31'). Returns '' for None."""
    if seconds is None:
        return ""
    seconds = int(round(seconds))
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def parse_mmss(text: str) -> int:
    m, s = text.split(":")
    return int(m) * 60 + int(s)


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def breathe_up_for(year: int) -> int:
    """Fixed breathe-up protocol: 4:00 through 2023, 4:30 from 2024 onwards."""
    return parse_mmss("04:00") if year <= 2023 else parse_mmss("04:30")


# ---------------------------------------------------------------------------
# Periodisation config (plain data)
# ---------------------------------------------------------------------------
# achieved_fl_pb / achieved_rv_pb = the training PB *hit during this cycle's
# peaking block*. prev_fl_pb / prev_rv_pb drive the 65-85% working bands.
# comp = (date, realised seconds, card) for the cycle's target competition.


@dataclass(frozen=True)
class Cycle:
    cycle_id: str
    year: int
    start: date
    peak: date  # last day of peaking block (≈ the target comp)
    prev_fl_pb: int  # seconds — previous cycle FL PB (for working %)
    achieved_fl_pb: int  # seconds — training FL PB reached this cycle
    prev_rv_pb: int  # seconds — previous cycle RV PB
    achieved_rv_pb: int  # seconds — training RV PB reached this cycle
    comp_date: date
    comp_seconds: int
    comp_card: str
    note: str = ""

    @property
    def peak_start(self) -> date:
        return self.peak - timedelta(days=10)


# Baseline at end of 2022 (from real comp/RV data: STA 7:07 comp -> ~7:25 train).
BASE_FL_PB = parse_mmss("07:25")
BASE_RV_PB = parse_mmss("03:11")

CYCLES: list[Cycle] = [
    Cycle("2023-A", 2023, date(2023, 1, 9), date(2023, 3, 19),
          BASE_FL_PB, parse_mmss("07:42"), BASE_RV_PB, parse_mmss("03:25"),
          date(2023, 3, 19), parse_mmss("07:20"), "White",
          "Spring cycle — Flow State comp peak."),
    Cycle("2023-B", 2023, date(2023, 5, 29), date(2023, 8, 6),
          parse_mmss("07:42"), parse_mmss("08:10"), parse_mmss("03:25"), parse_mmss("03:45"),
          date(2023, 8, 6), parse_mmss("07:50"), "White",
          "Summer cycle — Summer Buzz peak, RV PB 3:45."),
    Cycle("2024-A", 2024, date(2024, 2, 19), date(2024, 5, 11),
          parse_mmss("08:10"), parse_mmss("08:45"), parse_mmss("03:45"), parse_mmss("03:45"),
          date(2024, 5, 11), parse_mmss("08:22"), "White",
          "Breakthrough cycle — 8:22 comp; RV plateau at 3:45."),
    Cycle("2024-B", 2024, date(2024, 6, 10), date(2024, 8, 10),
          parse_mmss("08:45"), parse_mmss("08:30"), parse_mmss("03:45"), parse_mmss("03:42"),
          date(2024, 8, 10), parse_mmss("07:32"), "White",
          "Strong training but comp underperformed (7:32) — poor comp != poor training."),
    Cycle("2025-A", 2025, date(2025, 3, 24), date(2025, 6, 8),
          parse_mmss("08:30"), parse_mmss("08:28"), parse_mmss("03:42"), parse_mmss("03:52"),
          date(2025, 6, 8), parse_mmss("08:02"), "White",
          "Rebuild after off-season; Road to Wakayama peak."),
    Cycle("2025-B", 2025, date(2025, 9, 29), date(2025, 12, 19),
          parse_mmss("08:28"), parse_mmss("08:55"), parse_mmss("03:52"), parse_mmss("04:02"),
          date(2025, 12, 19), parse_mmss("08:31"), "White",
          "Peak year — National Record 8:31; RV PB 4:02."),
]

# Real AIDA STA competition results within the dataset span (date, announced,
# realised seconds, card, points, remark). Used for the Competition Results tab.
COMP_RESULTS = [
    ("2023-02-11", "00:01", "06:15", "White", 75.0, "AIDA One Breath 2023"),
    ("2023-02-18", "06:00", "07:18", "Red", 0.0, "One Breath — DQ airways"),
    ("2023-03-14", "06:00", "06:46", "White", 81.2, "A42 Dream State Comp"),
    ("2023-03-19", "00:01", "07:20", "White", 88.0, "A42 Flow State (cycle 2023-A peak)"),
    ("2023-06-03", "03:00", "06:16", "Yellow", 74.2, "UFC 5.5 Road to Jeju — yellow late start"),
    ("2023-06-15", "03:30", "05:46", "White", 69.2, "30th AIDA Pool World Champs — off-peak"),
    ("2023-08-06", "03:20", "07:50", "White", 94.0, "GetEcSTAtic Summer Buzz (cycle 2023-B peak)"),
    ("2023-08-06", "03:20", "05:30", "White", 66.0, "GetMoreEcSTAtic Summer Buzz — second dive"),
    ("2023-10-08", "05:30", "06:02", "White", 72.4, "Ultimate Static League Beta2 — off-peak"),
    ("2023-12-16", "00:01", "05:37", "White", 67.4, "Ultimate Static League Beta3 — off-peak"),
    ("2024-05-05", "06:00", "06:31", "White", 78.2, "UFC 8 AIDA"),
    ("2024-05-11", "00:20", "06:01", "White", 72.2, "May Spritz Comp 1"),
    ("2024-05-11", "00:21", "08:22", "White", 100.4, "May Spritz Comp 2 (cycle 2024-A peak)"),
    ("2024-08-10", "07:00", "07:32", "White", 90.4, "GetEcstatic Olympiad R2 (cycle 2024-B peak, underperf.)"),
    ("2025-06-07", "00:01", "06:33", "White", 78.6, "Road to Wakayama — day 1"),
    ("2025-06-08", "00:01", "08:02", "White", 96.4, "Road to Wakayama (cycle 2025-A peak)"),
    ("2025-09-13", "06:00", "06:31", "White", 78.2, "Get EcSTAtic Unknown — off-peak"),
    ("2025-09-14", "06:00", "06:00", "White", 72.0, "Get EcSTAtic Unknown — off-peak"),
    ("2025-09-14", "06:00", "07:02", "White", 84.4, "Get EcSTAtic Unknown — off-peak"),
    ("2025-09-15", "06:00", "06:06", "White", 73.2, "Get EcSTAtic Unknown — off-peak"),
    ("2025-12-19", "07:00", "08:31", "White", 102.2, "Indonesia Nationals — NATIONAL RECORD (cycle 2025-B peak)"),
    ("2025-12-20", "05:00", "06:30", "White", 78.0, "Molchanovs CORE Challenge — second dive"),
]

# Spirometry: lung volume peaks just before big performances, detrains after.
# (date, FVC L, FVC+packing L, note)
SPIROMETRY = [
    ("2023-03-12", 6.5, 7.7, "Pre Flow State peak"),
    ("2023-08-02", 6.8, 8.0, "Pre Summer Buzz peak — season best"),
    ("2023-11-20", 6.4, 7.5, "Off-season"),
    ("2024-05-08", 7.2, 8.3, "Pre May Spritz peak — season best"),
    ("2024-08-07", 7.0, 8.1, "Pre Olympiad peak"),
    ("2024-12-15", 6.7, 7.8, "Off-season"),
    ("2025-06-05", 7.1, 8.2, "Pre Wakayama peak"),
    ("2025-12-16", 7.3, 8.5, "Pre Nationals peak — all-time best"),
    ("2026-02-10", 6.9, 7.9, "Maintenance — detraining"),
    ("2026-06-15", 6.8, 7.8, "Maintenance — less stretching, reduced volume"),
]

POOL_OFF_SEASON_END = date(2026, 6, 28)  # current date; 2026 maintenance window end

# ---------------------------------------------------------------------------
# Session generation (pure-ish; uses a single seeded RNG passed in)
# ---------------------------------------------------------------------------


@dataclass
class Schedule:
    """Holds generated row dicts for each sheet."""
    fl: list = field(default_factory=list)
    rv_summary: list = field(default_factory=list)
    rv_reps: list = field(default_factory=list)


def phase_for(cycle: Cycle, day: date) -> str:
    if day >= cycle.peak_start:
        return "peak"
    span = (cycle.peak_start - cycle.start).days or 1
    frac = (day - cycle.start).days / span
    return "base" if frac < 0.5 else "build"


def fl_target_seconds(cycle: Cycle, day: date, rng: random.Random) -> tuple[int, str, int]:
    """Working full-lung hold for base/build (65-85% of previous cycle's PB).

    Peaking (final 10 days) is NOT handled here — it is an explicit +15s
    staircase generated by inject_peaking_staircase()."""
    band = rng.uniform(0.65, 0.85)
    target = band * cycle.prev_fl_pb + rng.uniform(-5, 5)
    rpe = int(clamp(3 + (band - 0.65) / 0.2 * 4 + rng.uniform(-0.5, 0.5), 3, 7))
    return int(round(target)), "submax", rpe


def rv_target_seconds(cycle: Cycle, day: date, rng: random.Random) -> tuple[int, str, int]:
    phase = phase_for(cycle, day)
    if phase == "peak":
        days_left = (cycle.peak - day).days
        frac = clamp(1 - days_left / 10, 0.0, 1.0)
        lo = 0.86 * cycle.prev_rv_pb
        hi = cycle.achieved_rv_pb + rng.randint(-3, 4)
        target = lo + frac * (hi - lo) + rng.uniform(-4, 4)
        effort = "max" if frac > 0.55 else "submax"
        rpe = int(clamp(7 + frac * 2 + rng.uniform(-0.5, 0.5), 6, 10))
        return int(round(target)), effort, rpe
    band = rng.uniform(0.65, 0.85)
    target = band * cycle.prev_rv_pb + rng.uniform(-4, 4)
    rpe = int(clamp(3 + (band - 0.65) / 0.2 * 4 + rng.uniform(-0.5, 0.5), 3, 7))
    return int(round(target)), "submax", rpe


def biometrics_fl(hold_s: int, effort: str, rng: random.Random) -> dict:
    """Min SpO2 / time-below thresholds / min HR / contraction onset for FL."""
    if effort == "max":
        min_spo2 = rng.randint(35, 41)  # pulse-ox floors near 35
        min_hr = rng.randint(57, 66)
        t40 = rng.randint(10, 26) if min_spo2 <= 40 else 0
    else:
        min_spo2 = rng.randint(52, 74)
        min_hr = rng.randint(72, 95)
        t40 = 0
    t50 = t40 + (rng.randint(8, 22) if min_spo2 < 50 else 0)
    t60 = t50 + (rng.randint(10, 28) if min_spo2 < 60 else 0)
    t70 = t60 + (rng.randint(12, 30) if min_spo2 < 70 else 0)
    onset = int(clamp(hold_s * rng.uniform(0.42, 0.6), 30, hold_s - 10))
    return dict(min_spo2=min_spo2, min_hr=min_hr,
                t70=t70, t60=t60, t50=t50, t40=t40, contraction_onset=onset)


# Seconds spent below 40% SpO2 on the PB attempt, per the athlete's real data.
YEAR_PEAK_T40 = {2023: 22, 2024: 15, 2025: 25}


def biometrics_fl_peaking(hold_s: int, pb_s: int, year: int, rng: random.Random) -> dict:
    """Biometrics for a peaking-staircase hold, scaled by how close it is to PB.
    The closer to PB, the lower SpO2/HR and the longer the time below 40%."""
    frac = hold_s / pb_s  # ~0.89 (PB-60) up to 1.0 (PB)
    min_spo2 = int(clamp(round(36 + (1 - frac) * 110 + rng.uniform(-1, 1)), 35, 58))
    min_hr = int(clamp(round(58 + (1 - frac) * 130 + rng.uniform(-1, 1)), 56, 80))
    if min_spo2 <= 40:
        base = YEAR_PEAK_T40.get(year, 20)
        # Full at PB, tapering ~1s per second below PB.
        t40 = int(clamp(base - (pb_s - hold_s), 4, base + 3))
    else:
        t40 = 0
    t50 = t40 + (rng.randint(8, 22) if min_spo2 < 50 else 0)
    t60 = t50 + (rng.randint(10, 28) if min_spo2 < 60 else 0)
    t70 = t60 + (rng.randint(12, 30) if min_spo2 < 70 else 0)
    onset = int(clamp(hold_s * rng.uniform(0.5, 0.62), 60, hold_s - 10))
    return dict(min_spo2=min_spo2, min_hr=min_hr,
                t70=t70, t60=t60, t50=t50, t40=t40, contraction_onset=onset)


def biometrics_rv(hold_s: int, effort: str, rng: random.Random) -> dict:
    """RV (empty-lung) desaturates faster & contracts earlier than FL."""
    if effort == "max":
        min_spo2 = rng.randint(35, 40)
        min_hr = rng.randint(44, 52)
        t40 = rng.randint(8, 22) if min_spo2 <= 40 else 0
    else:
        min_spo2 = rng.randint(46, 64)
        min_hr = rng.randint(54, 66)
        t40 = 0
    t50 = t40 + (rng.randint(6, 18) if min_spo2 < 50 else 0)
    t60 = t50 + (rng.randint(8, 22) if min_spo2 < 60 else 0)
    t70 = t60 + (rng.randint(10, 24) if min_spo2 < 70 else 0)
    onset = int(clamp(hold_s * rng.uniform(0.18, 0.34), 8, max(9, hold_s - 5)))
    return dict(min_spo2=min_spo2, min_hr=min_hr,
                t70=t70, t60=t60, t50=t50, t40=t40, contraction_onset=onset)


# Lowest body weight reached at each year's peak (kg). 2026 has no cut.
YEAR_LOW_WEIGHT = {2023: 66.0, 2024: 65.0, 2025: 65.0}
WEIGHT_CYCLE_START = 70.5  # ~70 kg at the start of a cycle, before tapering


def body_weight_for(year: int, cycle, day: date, in_cycle: bool, rng: random.Random) -> float:
    """Weight tapers week-by-week from ~70 kg at cycle start to the year's low
    at peak. 2026 = no fasting/cycle (70-75 kg); between-cycle weeks rebound."""
    if year >= 2026:
        return round(rng.uniform(70.0, 75.0), 1)
    if in_cycle and cycle is not None:
        low = YEAR_LOW_WEIGHT.get(year, 65.0)
        span = (cycle.peak - cycle.start).days or 1
        frac = clamp((day - cycle.start).days / span, 0.0, 1.0)
        weight = WEIGHT_CYCLE_START - frac * (WEIGHT_CYCLE_START - low)
        return round(weight + rng.uniform(-0.3, 0.3), 1)
    return round(rng.uniform(69.0, 72.0), 1)  # off-season rebound (2023-2025)


def context(rng: random.Random, day: date, phase: str, body_weight: float) -> dict:
    sleep = round(clamp(rng.gauss(7.3, 0.8), 5.0, 9.0), 1)
    meal = round(clamp(rng.gauss(4.0, 1.5), 1.5, 8.0), 1)
    # Resting HR drops in the peaking block (heavy fasting in final 10 days);
    # otherwise 65-75, with bad days at the top of the range.
    resting_hr = rng.randint(52, 58) if phase == "peak" else rng.randint(65, 75)
    mental = int(clamp(rng.gauss(7 if phase == "peak" else 6, 1.3), 3, 10))
    return dict(body_weight=body_weight, sleep=sleep, hours_since_meal=meal,
                resting_hr=resting_hr, mental=mental)


def weekly_session_counts(phase_in_cycle: bool, rng: random.Random) -> tuple[int, int]:
    """(rv_count, fl_count) for one week, with natural variance."""
    if not phase_in_cycle:
        # Between cycles / maintenance: ~1 RV + 1 FL, sometimes a skipped week.
        roll = rng.random()
        if roll < 0.15:
            return (0, 0)  # illness / travel / rest week
        return (rng.choice([1, 1, 1, 2]), rng.choice([0, 1, 1, 1]))
    roll = rng.random()
    if roll < 0.08:
        return (rng.choice([1, 2]), rng.choice([0, 1]))  # down week (illness)
    rv = rng.choice([3, 3, 3, 4, 2])
    fl = rng.choice([2, 2, 2, 3, 1])
    return (rv, fl)


def build_fl_row(cycle_id, year, day, phase, hold_s, effort, rpe, bio, ctx, tag, note):
    return {
        "Date": day.isoformat(),
        "Year": year,
        "Cycle": cycle_id,
        "Phase": phase,
        "Days to comp": "",  # filled by caller when in a cycle
        "Effort": effort,
        "Lung volume": "FL",
        "Breathe-up": "",
        "Hold (mm:ss)": mmss(hold_s),
        "Hold (s)": hold_s,
        "Contraction onset (mm:ss)": mmss(bio["contraction_onset"]),
        "Min SpO2 %": bio["min_spo2"],
        "Time <70% (s)": bio["t70"],
        "Time <60% (s)": bio["t60"],
        "Time <50% (s)": bio["t50"],
        "Time <40% (s)": bio["t40"],
        "Min HR (bpm)": bio["min_hr"],
        "Resting HR": ctx["resting_hr"],
        "RPE": rpe,
        "Mental readiness": ctx["mental"],
        "Body wt (kg)": ctx["body_weight"],
        "Sleep (h)": ctx["sleep"],
        "Hrs since meal": ctx["hours_since_meal"],
        "Tag": tag,
        "Notes": note,
    }


def generate(rng: random.Random) -> Schedule:
    sched = Schedule()

    # Build the set of in-cycle days and which cycle they belong to.
    def cycles_for_year(y):
        return [c for c in CYCLES if c.year == y]

    # Walk week by week from 2023-01-02 (Mon) to 2026-06-28.
    cursor = date(2023, 1, 2)
    end = POOL_OFF_SEASON_END
    rv_session_seq = 0

    while cursor <= end:
        week_start = cursor
        # Which cycle (if any) contains this week?
        active = next((c for c in CYCLES if c.start <= week_start <= c.peak), None)
        in_cycle = active is not None
        rv_n, fl_n = weekly_session_counts(in_cycle, rng)

        # Distribute sessions across the week on distinct weekdays.
        weekdays = list(range(7))
        rng.shuffle(weekdays)
        slots = weekdays[: rv_n + fl_n]
        kinds = ["RV"] * rv_n + ["FL"] * fl_n
        rng.shuffle(kinds)

        for offset, kind in zip(slots, kinds):
            day = week_start + timedelta(days=offset)
            if day > end:
                continue

            if in_cycle:
                cycle = active
                phase = phase_for(cycle, day)
                # Peaking full-lung sessions are the deterministic +15s staircase
                # (inject_peaking_staircase); don't add random FL holds here.
                if kind == "FL" and phase == "peak":
                    continue
                cycle_id, year = cycle.cycle_id, cycle.year
                days_to_comp = (cycle.comp_date - day).days
            else:
                # Maintenance: synthesise a light pseudo-context @ ~75% of the
                # most recent achieved PB.
                prev = max((c for c in CYCLES if c.peak <= day), key=lambda c: c.peak, default=CYCLES[-1])
                cycle = prev
                phase = "off-season"
                cycle_id, year = "maintenance", day.year
                days_to_comp = ""

            bw = body_weight_for(year if in_cycle else day.year, cycle, day, in_cycle, rng)
            ctx = context(rng, day, phase, bw)

            if kind == "FL":
                if in_cycle:
                    hold_s, effort, rpe = fl_target_seconds(cycle, day, rng)
                else:
                    hold_s = int(round(0.75 * cycle.achieved_fl_pb + rng.uniform(-8, 8)))
                    effort, rpe = "submax", rng.randint(4, 6)
                bio = biometrics_fl(hold_s, effort, rng)
                breathe_up = breathe_up_for(year)
                tag = "peaking" if phase == "peak" else ("maintenance" if not in_cycle else "working")
                note = ""
                if effort == "max" and phase == "peak":
                    note = "Peaking max attempt"
                row = build_fl_row(cycle_id, year, day, phase, hold_s, effort, rpe, bio, ctx, tag, note)
                row["Breathe-up"] = mmss(breathe_up)
                row["Days to comp"] = days_to_comp
                sched.fl.append(row)
            else:  # RV series, 8 reps
                rv_session_seq += 1
                sid = f"RV{rv_session_seq:04d}"
                if in_cycle:
                    target, effort, rpe = rv_target_seconds(cycle, day, rng)
                else:
                    target = int(round(0.75 * cycle.achieved_rv_pb + rng.uniform(-6, 6)))
                    effort, rpe = "submax", rng.randint(4, 6)
                rep_rows, summary = build_rv_session(
                    sid, cycle_id, year, day, phase, target, effort, rpe, ctx, rng, days_to_comp
                )
                sched.rv_reps.extend(rep_rows)
                sched.rv_summary.append(summary)

        cursor += timedelta(days=7)

    # Guarantee each cycle realises its benchmark FL & RV PB during peaking
    # (random weekly scheduling can otherwise miss the final few days).
    inject_cycle_peaks(sched, rng)
    # 2026 isolated max-RV test holds to honour the Max RV 4:15 data point.
    inject_2026_rv_tests(sched, rng)
    return sched


def inject_cycle_peaks(sched: Schedule, rng: random.Random):
    """Build each cycle's peaking block.

    Full-lung peaking = 5 sessions across the final 10 days, each adding 15s to
    the previous max hold (PB-60 -> PB), climaxing at the cycle's PB on the last
    training session ~2 days before the competition. The diver then performs the
    comp itself per the real AIDA result (recorded on the Competition tab)."""
    for c in CYCLES:
        pb = c.achieved_fl_pb
        steps = 5
        days_before = [10, 8, 6, 4, 2]
        # +15s staircase: PB-60, PB-45, PB-30, PB-15, PB.
        holds = [pb - 15 * (steps - 1 - i) for i in range(steps)]
        for i, (db, hold) in enumerate(zip(days_before, holds)):
            day = c.peak - timedelta(days=db)
            is_pb = (i == steps - 1)
            effort = "max" if is_pb else "submax"
            ctx = context(rng, day, "peak", body_weight_for(c.year, c, day, True, rng))
            bio = biometrics_fl_peaking(hold, pb, c.year, rng)
            rpe = 10 if is_pb else int(clamp(7 + i, 7, 9))
            note = (f"Peaking staircase {i + 1}/5 — MAX / training PB" if is_pb
                    else f"Peaking staircase {i + 1}/5 — +15s step to {mmss(hold)}")
            row = build_fl_row(c.cycle_id, c.year, day, "peak",
                               hold, effort, rpe, bio, ctx, "peaking", note)
            row["Breathe-up"] = mmss(breathe_up_for(c.year))
            row["Days to comp"] = (c.comp_date - day).days
            sched.fl.append(row)

        # RV PB session, 3 days before the comp.
        rv_day = c.peak - timedelta(days=3)
        ctx = context(rng, rv_day, "peak", body_weight_for(c.year, c, rv_day, True, rng))
        seq = 8000 + CYCLES.index(c)
        rep_rows, summary = build_rv_session(
            f"RV{seq}", c.cycle_id, c.year, rv_day, "peak",
            c.achieved_rv_pb, "max", 9, ctx, rng, (c.comp_date - rv_day).days,
            exact_longest=True
        )
        summary["Notes"] = "Peaking RV PB session"
        sched.rv_reps.extend(rep_rows)
        sched.rv_summary.append(summary)


def build_rv_session(sid, cycle_id, year, day, phase, target, effort, rpe, ctx, rng, days_to_comp,
                     exact_longest=False):
    """8-rep RV series: warm-up reps build toward the session's peak rep.

    exact_longest pins the peak rep to `target` (used for benchmark PB sessions
    so the realised Max RV matches the athlete's real data exactly)."""
    n = 8
    # Rep multipliers: ramp up to ~rep 5-6 then ease off slightly.
    shape = [0.82, 0.88, 0.93, 0.97, 1.0, 0.99, 0.95, 0.90]
    rep_rows = []
    durations = []
    spo2_nadir = 100
    min_hr_all = 200
    t40_total = t50_total = t60_total = t70_total = 0
    total_apnea = 0
    for i in range(n):
        if exact_longest and i == 4:
            dur = target
        else:
            dur = int(round(target * shape[i] * rng.uniform(0.97, 1.0)))
        rep_effort = "max" if (effort == "max" and i in (4, 5)) else "submax"
        bio = biometrics_rv(dur, rep_effort, rng)
        rest = rng.randint(105, 150)
        durations.append(dur)
        total_apnea += dur
        spo2_nadir = min(spo2_nadir, bio["min_spo2"])
        min_hr_all = min(min_hr_all, bio["min_hr"])
        t40_total += bio["t40"]
        t50_total += bio["t50"]
        t60_total += bio["t60"]
        t70_total += bio["t70"]
        rep_rows.append({
            "Session ID": sid,
            "Date": day.isoformat(),
            "Cycle": cycle_id,
            "Phase": phase,
            "Rep #": i + 1,
            "Effort": rep_effort,
            "Hold (mm:ss)": mmss(dur),
            "Hold (s)": dur,
            "Contraction onset (mm:ss)": mmss(bio["contraction_onset"]),
            "Min SpO2 %": bio["min_spo2"],
            "Time <50% (s)": bio["t50"],
            "Time <40% (s)": bio["t40"],
            "Min HR (bpm)": bio["min_hr"],
            "Rest after (mm:ss)": mmss(rest),
        })
    longest = max(durations)
    summary = {
        "Session ID": sid,
        "Date": day.isoformat(),
        "Year": year,
        "Cycle": cycle_id,
        "Phase": phase,
        "Days to comp": days_to_comp,
        "Effort": effort,
        "Lung volume": "RV",
        "Reps": n,
        "Longest hold (mm:ss)": mmss(longest),
        "Longest hold (s)": longest,
        "Total apnea (mm:ss)": mmss(total_apnea),
        "Total apnea (s)": total_apnea,
        "SpO2 nadir %": spo2_nadir,
        "Time <60% (s)": t60_total,
        "Time <50% (s)": t50_total,
        "Time <40% (s)": t40_total,
        "Min HR (bpm)": min_hr_all,
        "Resting HR": ctx["resting_hr"],
        "RPE": rpe,
        "Mental readiness": ctx["mental"],
        "Body wt (kg)": ctx["body_weight"],
        "Sleep (h)": ctx["sleep"],
        "Tag": "peaking" if phase == "peak" else ("maintenance" if cycle_id == "maintenance" else "working"),
        "Notes": "RV PB attempt" if effort == "max" and phase == "peak" else "",
    }
    return rep_rows, summary


def inject_2026_rv_tests(sched: Schedule, rng: random.Random):
    """A couple of isolated max RV test holds in 2026 reaching the 4:15 PB."""
    tests = [(date(2026, 3, 21), 250), (date(2026, 6, 14), 255)]
    seq = 9000
    for day, target in tests:
        seq += 1
        sid = f"RV{seq}"
        ctx = context(rng, day, "peak", body_weight_for(2026, None, day, False, rng))
        rep_rows, summary = build_rv_session(
            sid, "maintenance", 2026, day, "peak", target, "max", 9, ctx, rng, "",
            exact_longest=True
        )
        summary["Notes"] = "Isolated max RV test (maintenance year) — new RV PB"
        summary["Tag"] = "test"
        sched.rv_reps.extend(rep_rows)
        sched.rv_summary.append(summary)


# ---------------------------------------------------------------------------
# Excel writing (the side-effect edge)
# ---------------------------------------------------------------------------

HEADER_FILL = PatternFill("solid", fgColor="0F766E")  # teal-700
HEADER_FONT = Font(bold=True, color="FFFFFF")
PHASE_FILLS = {
    "base": PatternFill("solid", fgColor="E2E8F0"),
    "build": PatternFill("solid", fgColor="BAE6FD"),
    "peak": PatternFill("solid", fgColor="FBCFE8"),
    "off-season": PatternFill("solid", fgColor="F1F5F9"),
}
THIN = Side(style="thin", color="CBD5E1")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def write_table(ws, rows, freeze="A2"):
    if not rows:
        return
    headers = list(rows[0].keys())
    ws.append(headers)
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=c)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = BORDER
    phase_col = headers.index("Phase") + 1 if "Phase" in headers else None
    for r, row in enumerate(rows, start=2):
        for c, h in enumerate(row.values(), start=1):
            cell = ws.cell(row=r, column=c, value=h)
            cell.border = BORDER
            cell.alignment = Alignment(horizontal="center")
        if phase_col:
            ph = row.get("Phase")
            fill = PHASE_FILLS.get(ph)
            if fill:
                ws.cell(row=r, column=phase_col).fill = fill
    # Column widths
    for c, h in enumerate(headers, start=1):
        width = max(len(str(h)), 8)
        if h in ("Notes",):
            width = 42
        elif "mm:ss" in h or h in ("Cycle", "Session ID", "Date", "Effort", "Phase", "Tag", "Lung volume"):
            width = max(width, 13)
        ws.column_dimensions[get_column_letter(c)].width = width + 2
    ws.freeze_panes = freeze


def write_readme(ws):
    lines = [
        ("Overdive — Synthetic Training Dataset", True),
        ("Athlete model based on real AIDA STA results & physiology of tom.way.singapore@gmail.com.", False),
        ("Generated by generate_dataset.py (seeded, reproducible). Span: Jan 2023 – Jun 2026.", False),
        ("", False),
        ("TABS", True),
        ("STA Full-Lung Sessions  — one row per FL static (sub-max working holds + peaking maxes + comps).", False),
        ("RV Series (summary)     — one row per 8-rep dry RV table session.", False),
        ("RV Series (per rep)     — the 8 individual holds for each RV session.", False),
        ("Spirometry              — periodic FVC / FVC+packing measurements.", False),
        ("Competition Results     — real AIDA STA results within span.", False),
        ("Cycles                  — the 2-per-year periodisation calendar + targets.", False),
        ("Annual Summary          — PB / RV / lung-volume / SpO2 trends + charts.", False),
        ("", False),
        ("KEY METRICS (mirror the Overdive app)", True),
        ("Hold time (mm:ss) with a parallel (s) seconds column for charting.", False),
        ("Min SpO2 % — pulse-oximeter floors at 35%; values of 35 mean 'at or below 35'.", False),
        ("Time <70/60/50/40% (s) — cumulative seconds below each SpO2 threshold.", False),
        ("Min HR (bpm) — FL 75-95 working / down to ~59 peaking; RV 55-65 / down to ~45 peaking.", False),
        ("Contraction onset — time to first involuntary contraction.", False),
        ("Effort — 'submax' for the 65-85% bulk of a cycle; 'max' only in the final 10-day peaking block.", False),
        ("Phase — base / build / peak (last 10 days) / off-season (maintenance, incl. all of 2026).", False),
        ("", False),
        ("PERIODISATION RULES MODELLED", True),
        ("2 cycles/year; bulk holds at 65-85% of the PREVIOUS cycle's PB.", False),
        ("Final 10 days ramp up to / past PB. Comp times land 15-30s below training PB.", False),
        ("Poor comp results do NOT imply poor training (see 2024-B: 8:30 training, 7:32 comp).", False),
        ("2026 = maintenance only (~1 RV + 1 FL/week @ ~75%); spirometry detrains (FVC 7.3->6.8).", False),
    ]
    for i, (text, bold) in enumerate(lines, start=1):
        cell = ws.cell(row=i, column=1, value=text)
        cell.font = Font(bold=bold, size=13 if (bold and i == 1) else 11)
    ws.column_dimensions["A"].width = 100


def write_cycles(ws):
    rows = []
    for c in CYCLES:
        rows.append({
            "Cycle": c.cycle_id,
            "Year": c.year,
            "Start": c.start.isoformat(),
            "Peak / comp": c.peak.isoformat(),
            "Peaking from": c.peak_start.isoformat(),
            "Prev FL PB": mmss(c.prev_fl_pb),
            "Working band 65-85%": f"{mmss(round(0.65*c.prev_fl_pb))}–{mmss(round(0.85*c.prev_fl_pb))}",
            "Achieved FL PB": mmss(c.achieved_fl_pb),
            "Achieved RV PB": mmss(c.achieved_rv_pb),
            "Comp result": mmss(c.comp_seconds),
            "PB→comp gap (s)": c.achieved_fl_pb - c.comp_seconds,
            "Card": c.comp_card,
            "Notes": c.note,
        })
    write_table(ws, rows)


def write_competition(ws):
    rows = []
    for d, ann, real, card, pts, remark in COMP_RESULTS:
        rows.append({
            "Date": d,
            "Discipline": "STA",
            "Announced": ann,
            "Realised (mm:ss)": real,
            "Realised (s)": parse_mmss(real),
            "Card": card,
            "Points": pts,
            "Competition / note": remark,
        })
    write_table(ws, rows)


def write_spirometry(ws):
    rows = []
    for d, fvc, fvcp, note in SPIROMETRY:
        rows.append({
            "Date": d,
            "FVC (L)": fvc,
            "FVC + packing (L)": fvcp,
            "Packing gain (L)": round(fvcp - fvc, 2),
            "Notes": note,
        })
    write_table(ws, rows)


def write_annual_summary(ws, sched: Schedule):
    # Aggregate per calendar year from generated data.
    years = [2023, 2024, 2025, 2026]
    fl_by_year = {y: [] for y in years}
    rv_by_year = {y: [] for y in years}
    for r in sched.fl:
        fl_by_year[r["Year"]].append(r["Hold (s)"])
    for r in sched.rv_summary:
        rv_by_year[r["Year"]].append(r["Longest hold (s)"])

    comp_best = {2023: parse_mmss("07:50"), 2024: parse_mmss("08:22"),
                 2025: parse_mmss("08:31"), 2026: None}
    fvc_by_year = {2023: 6.8, 2024: 7.2, 2025: 7.3, 2026: 6.8}

    rows = []
    for y in years:
        fl_pb = max(fl_by_year[y]) if fl_by_year[y] else None
        rv_pb = max(rv_by_year[y]) if rv_by_year[y] else None
        ratio = round(rv_pb / fl_pb, 3) if (fl_pb and rv_pb) else ""
        rows.append({
            "Year": y,
            "FL training PB (mm:ss)": mmss(fl_pb),
            "FL training PB (s)": fl_pb or "",
            "Comp STA best (mm:ss)": mmss(comp_best[y]) if comp_best[y] else "—",
            "RV training PB (mm:ss)": mmss(rv_pb),
            "RV training PB (s)": rv_pb or "",
            "RV:FL ratio": ratio,
            "FVC (L)": fvc_by_year[y],
            "FL sessions": len(fl_by_year[y]),
            "RV sessions": len(rv_by_year[y]),
        })
    write_table(ws, rows)

    # Line chart: FL & RV training PB (seconds) over the years.
    n = len(rows)
    chart = LineChart()
    chart.title = "Training PB progression (seconds)"
    chart.y_axis.title = "Seconds"
    chart.x_axis.title = "Year"
    cats = Reference(ws, min_col=1, min_row=2, max_row=1 + n)
    fl_ref = Reference(ws, min_col=3, min_row=1, max_row=1 + n)  # FL PB (s)
    rv_ref = Reference(ws, min_col=6, min_row=1, max_row=1 + n)  # RV PB (s)
    chart.add_data(fl_ref, titles_from_data=True)
    chart.add_data(rv_ref, titles_from_data=True)
    chart.set_categories(cats)
    chart.height, chart.width = 8, 16
    ws.add_chart(chart, "A8")

    fvc_chart = LineChart()
    fvc_chart.title = "FVC by year (L)"
    fvc_chart.y_axis.title = "Litres"
    fvc_ref = Reference(ws, min_col=8, min_row=1, max_row=1 + n)
    fvc_chart.add_data(fvc_ref, titles_from_data=True)
    fvc_chart.set_categories(cats)
    fvc_chart.height, fvc_chart.width = 8, 16
    ws.add_chart(fvc_chart, "A25")


def write_workbook(sched: Schedule):
    wb = Workbook()
    write_readme(wb.active)
    wb.active.title = "README"

    write_table(wb.create_sheet("STA Full-Lung Sessions"), sched.fl)
    write_table(wb.create_sheet("RV Series (summary)"), sched.rv_summary)
    write_table(wb.create_sheet("RV Series (per rep)"), sched.rv_reps)
    write_spirometry(wb.create_sheet("Spirometry"))
    write_competition(wb.create_sheet("Competition Results"))
    write_cycles(wb.create_sheet("Cycles"))
    write_annual_summary(wb.create_sheet("Annual Summary"), sched)

    wb.save(OUT_FILE)


def main():
    rng = random.Random(SEED)
    sched = generate(rng)
    write_workbook(sched)
    print(f"Wrote {OUT_FILE}")
    print(f"  FL sessions:      {len(sched.fl)}")
    print(f"  RV sessions:      {len(sched.rv_summary)}")
    print(f"  RV rep rows:      {len(sched.rv_reps)}")
    print(f"  Comp results:     {len(COMP_RESULTS)}")
    print(f"  Spirometry rows:  {len(SPIROMETRY)}")


if __name__ == "__main__":
    main()
