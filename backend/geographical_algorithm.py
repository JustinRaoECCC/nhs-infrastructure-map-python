# backend/geographical_algorithm.py
# Geographically order the Optimization I results into multi-day trips
# using data/algorithm_data/longterm_inspection_plan.json.

from __future__ import annotations
import os, json, math
from typing import Any, Dict, List, Tuple
import eel

HERE = os.path.dirname(__file__)
DATA_DIR = os.path.abspath(os.path.join(HERE, "..", "data"))
PLAN_PATH = os.path.join(DATA_DIR, "algorithm_data", "longterm_inspection_plan.json")

def _load_plan() -> dict:
    if not os.path.exists(PLAN_PATH):
        raise FileNotFoundError(f"Plan file not found: {PLAN_PATH}")
    with open(PLAN_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def _normalize_item(x: dict) -> dict:
    """
    Accepts rows from Optimization I (table) or any payload with these keys:
      station_id | stationId | station_number | Station Number
      operation  | Operation
      score      | Summed Value | value | percent
    Returns a canonical item dict: {'station_id','operation','score','days'}
    """
    # station id
    sid = (
        x.get("station_id")
        or x.get("stationId")
        or x.get("station_number")
        or x.get("Station Number")
        or x.get("station")
        or x.get("id")
        or ""
    )
    sid = str(sid).strip()

    # operation
    op = x.get("operation") or x.get("Operation") or x.get("task") or ""
    op = str(op).strip()

    # score / percent
    raw = (
        x.get("score")
        or x.get("Summed Value")
        or x.get("value")
        or x.get("percent")
        or x.get("Score")
        or 0
    )
    try:
        score = float(raw)
    except Exception:
        # accept strings like "62%" or "62.0%"
        try:
            score = float(str(raw).replace("%", "").strip())
        except Exception:
            score = 0.0

    # optional task duration (days) – accepts Workplan header "Days"
    days_raw = x.get("days") or x.get("Days")
    days_val = None
    if days_raw is not None:
        try:
            # accept strings like "1", "1.0", "1.25" -> ceil to the next full day
            days_val = max(1, int(math.ceil(float(str(days_raw).replace("%", "").strip()))))
        except Exception:
            days_val = None

    out = {"station_id": sid, "operation": op, "score": score}
    if days_val is not None:
        out["days"] = days_val
    return out


def _distribute_across_days(items: List[dict], days: int) -> List[dict]:
    """
    Given a list of items (already ordered by desired priority) and
    a positive number of days, annotate each with a 'day' field by
    distributing as evenly as possible, preserving relative order.
    """
    days = max(1, int(days or 1))
    n = len(items)
    if n == 0:
        return []

    base = n // days
    rem = n % days  # first 'rem' days get one extra

    out = []
    idx = 0
    for d in range(1, days + 1):
        take = base + (1 if d <= rem else 0)
        for _ in range(take):
            if idx >= n:
                break
            itm = dict(items[idx])
            itm["day"] = d
            out.append(itm)
            idx += 1
    # if anything left (shouldn't), put on last day
    while idx < n:
        itm = dict(items[idx]); itm["day"] = days; out.append(itm); idx += 1
    return out

def _schedule_by_item_duration(items: List[dict]) -> Tuple[List[dict], int]:
    """
    Sequentially assign a start 'day' to each item based on its own 'days' duration.
    Returns (scheduled_rows, total_days_used).
    - If an item has no 'days', assume 1.
    - 'day' is the *start* day for that task.
    """
    current_day = 1
    scheduled: List[dict] = []
    total_used = 0
    for it in items:
        d = it.get("days")
        if not isinstance(d, int) or d <= 0:
            d = 1
        row = dict(it)
        row["day"] = current_day
        scheduled.append(row)
        current_day += d
        total_used += d
    # total_used equals the final number of days needed for this sequence
    return scheduled, max(total_used, 1)


@eel.expose
def run_geographical_algorithm(payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """
    Reorders the Optimization I list by geographic trip groupings.
    Requires payload like: {'items': [{'station_id','operation','score'}, ...]}
    Returns a JSON blob the UI renders into a formatted table.
    """
    try:
        plan = _load_plan()
    except Exception as e:
        return {"success": False, "message": f"Could not load plan: {e}"}

    items_in = (payload or {}).get("items") or []
    if not items_in:
        # Explicitly require Optimization I to have run (and provided rows)
        return {
            "success": False,
            "message": "No Optimization I results provided. Run Optimization I first, then click Optimization II.",
        }

    items = [_normalize_item(x) for x in items_in if _normalize_item(x).get("station_id")]

    # Build station → (trip_name, mode, days) index
    station_to_trip: Dict[str, Tuple[str, str, int]] = {}
    trips_meta: Dict[str, Dict[str, Any]] = {}
    for t in plan.get("trips", []):
        tname = t.get("trip_name", "").strip()
        days = int(t.get("days") or 1)
        if not tname:
            continue
        trips_meta[tname] = {"days": days}
        for s in t.get("stations", []):
            sid = str(s.get("id", "")).strip()
            mode = str(s.get("transportation", "drive")).strip().lower() or "drive"
            if sid:
                station_to_trip[sid] = (tname, mode, days)

    # Group by trip (preserve incoming order which mirrors Opt I priority)
    grouped: Dict[str, List[dict]] = {}
    unplanned: List[dict] = []
    for it in items:
        sid = it["station_id"]
        if sid in station_to_trip:
            tname, mode, _days = station_to_trip[sid]
            entry = dict(it); entry["mode"] = mode
            grouped.setdefault(tname, []).append(entry)
        else:
            unplanned.append(dict(it))

    # Build trip outputs with per-day schedule and subtotals
    trips_out: List[Dict[str, Any]] = []
    for tname, rows in grouped.items():
        plan_days = int(trips_meta.get(tname, {}).get("days", 1))
        # If any row carries an explicit 'days' (from Workplan), schedule by duration
        if any("days" in r for r in rows):
            scheduled, used_days = _schedule_by_item_duration(rows)
            days_effective = max(plan_days, used_days)
        else:
            # fall back to even distribution by the plan's days
            days_effective = max(1, plan_days)
            scheduled = _distribute_across_days(rows, days_effective)

        drive_ct = sum(1 for r in rows if r.get("mode") == "drive")
        heli_ct  = sum(1 for r in rows if r.get("mode") == "helicopter")
        trips_out.append({
            "trip_name": tname,
            "days": days_effective,
            "count": len(rows),
            "drive_count": drive_ct,
            "helicopter_count": heli_ct,
            "schedule": scheduled,  # each has day, station_id, operation, score, mode
        })

    # Sort trips by rough priority: keep the first appearance order in Opt I
    # (the trip whose first member appears earlier in the Opt I list comes first)
    first_index: Dict[str, int] = {}
    pos = 0
    for it in items:
        sid = it["station_id"]
        if sid in station_to_trip:
            tname = station_to_trip[sid][0]
            if tname not in first_index:
                first_index[tname] = pos
        pos += 1
    trips_out.sort(key=lambda t: first_index.get(t["trip_name"], 10**9))

    return {
        "success": True,
        "plan_name": plan.get("plan_name", "Long-Term Inspection Plan"),
        "trips": trips_out,
        "unplanned": unplanned,  # items not mapped by the plan
        "totals": {
            "items_in": len(items),
            "planned": sum(t["count"] for t in trips_out),
            "unplanned": len(unplanned),
            "trip_count": len(trips_out),
        },
    }
