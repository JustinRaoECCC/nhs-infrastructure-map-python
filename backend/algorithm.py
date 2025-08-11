# backend/algorithm.py
# Core optimization logic for the workplan.

from typing import Any, Dict, List, Optional, Tuple

def _norm(x) -> str:
    """Normalize any cell value to a case-insensitive string for comparison."""
    if x is None:
        return ""
    s = str(x).strip()
    return s

def _try_float(s: str) -> Optional[float]:
    try:
        return float(str(s).replace(",", "").strip())
    except Exception:
        return None

def _build_param_index(parameters: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    Group flat rows by `parameter`, capture:
      - max_weight
      - options { normalized_option_label: numeric_weight }
    """
    out: Dict[str, Dict[str, Any]] = {}
    for row in parameters or []:
        pname = str(row.get("parameter", "")).strip()
        if not pname:
            continue
        grp = out.setdefault(pname, {"max_weight": None, "options": {}, "condition": row.get("condition")})

        # Prefer the latest non-null max_weight we see
        if row.get("max_weight") is not None:
            grp["max_weight"] = float(row["max_weight"])

        opt_label = _norm(row.get("option"))
        if opt_label != "":
            # If weight missing, treat as 0
            w = row.get("weight")
            try:
                grp["options"][opt_label] = float(w if w is not None else 0.0)
            except Exception:
                grp["options"][opt_label] = 0.0

    # Default any missing max_weight to the largest option weight, else 1
    for pname, grp in out.items():
        if grp["max_weight"] is None:
            grp["max_weight"] = max([1.0] + list(grp["options"].values()))
    return out

def _normalize_overall_weights(raw_map: Dict[str, Any], param_index: Dict[str, Any]) -> Dict[str, float]:
    """
    raw_map: { parameter_name: percentage (0..100) }
    Returns fractions that sum to 1.0. Missing/zero become 0.
    If everything is zero/missing, fall back to equal weighting across known parameters.
    """
    cleaned: Dict[str, float] = {}
    for pname in param_index.keys():
        v = raw_map.get(pname, 0) if isinstance(raw_map, dict) else 0
        try:
            cleaned[pname] = max(0.0, float(v))
        except Exception:
            cleaned[pname] = 0.0

    total = sum(cleaned.values())
    if total > 0:
        return {k: (v / total) for k, v in cleaned.items()}

    # Fallback: equal weights for every parameter we know
    n = max(1, len(param_index))
    return {k: 1.0 / n for k in param_index.keys()}

def _option_weight_for_value(param_cfg: Dict[str, Any], value: Any) -> float:
    """
    Map a TODO-row's parameter value → the configured option weight.
    Exact string match first. If none, try exact numeric equality.
    If still none, return 0.0.
    """
    options: Dict[str, float] = param_cfg.get("options", {})
    maxw: float = float(param_cfg.get("max_weight", 1))

    val_norm = _norm(value)
    if val_norm in options:
        return float(options[val_norm])

    # Try numeric equality (e.g., row has 3, option label is "3")
    vnum = _try_float(val_norm)
    if vnum is not None:
        for opt_label, w in options.items():
            onum = _try_float(opt_label)
            if onum is not None and onum == vnum:
                return float(w)

    return 0.0

def _match_option_weight(param_cfg: Dict[str, Any], value: Any) -> Tuple[bool, float]:
    """
    Like _option_weight_for_value, but tells you if the row's value matched any option.
    Returns (matched, weight). If not matched, returns (False, 0.0).
    This lets callers re-normalize weights over only the parameters that are present.
    """
    options: Dict[str, float] = param_cfg.get("options", {})

    val_norm = _norm(value)
    if val_norm in options:
        try:
            return True, float(options[val_norm])
        except Exception:
            return True, 0.0

    vnum = _try_float(val_norm)
    if vnum is not None:
        for opt_label, w in options.items():
            onum = _try_float(opt_label)
            if onum is not None and onum == vnum:
                try:
                    return True, float(w)
                except Exception:
                    return True, 0.0
    return False, 0.0


def optimize_workplan(
    stations: List[Dict[str, Any]],
    parameters: List[Dict[str, Any]],
    constants: List[Dict[str, Any]],
    workplan_rows: Optional[List[Dict[str, Any]]] = None,
    param_overall: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Rank the TODOs (rows from the dashboard Workplan table) using:

      By default, *missing/unmatched parameter values are neutral*:
      we re-normalize the overall weights over only the parameters that
      are present (i.e., whose value matches a configured option).

      score(row) =
        Σ_over_matched_parameters(
            ( option_weight(row_value) / max_weight(parameter) )
          * ( overall_weight_fraction(parameter) / Σ_over_matched overall_weight_fraction )
        )

    Notes:
      - 'condition' is currently ignored by request.
      - 'applies_to' is ignored for now (we can wire this later if needed).
      - overall weights from the UI are first normalized to sum to 1.0.
      - If a row value doesn't match any option, that parameter is skipped
        (neutral) for that row's score.

    Returns a dict including a sorted 'ranking' list.
    """
    # Build parameter config
    pindex = _build_param_index(parameters or [])

    # Normalize overall weights to fractions (sum to 1)
    overall_frac = _normalize_overall_weights(param_overall or {}, pindex)

    # Which parameter columns are we expecting on the Workplan table?
    # (Use the keys of pindex — those are the parameter names/columns.)
    param_names = list(pindex.keys())

    rows = workplan_rows or []
    results = []

    for i, row in enumerate(rows):
        # Friendly identity fields from the workplan table (best-effort)
        station_no = row.get("Station Number") or row.get("Station ID")
        operation  = row.get("Operation") or row.get("Repair Name")
        site_name  = row.get("Site Name")

        # ── Determine which parameters are "present" on this row (matched to an option)
        per_param: Dict[str, Dict[str, Any]] = {}
        present_sum = 0.0
        for pname in param_names:
            cfg   = pindex[pname]
            matched, w_opt = _match_option_weight(cfg, row.get(pname))
            maxw  = float(cfg.get("max_weight", 1) or 1)
            frac  = float(overall_frac.get(pname, 0.0))

            per_param[pname] = {
                "matched": matched,
                "option_weight": w_opt,
                "max_weight": maxw,
                "overall_fraction": frac,
                "row_value": row.get(pname, None),
            }
            if matched and maxw > 0 and frac > 0:
                present_sum += frac

        # Renormalize overall fractions over only the matched parameters
        renorm = (1.0 / present_sum) if present_sum > 0 else 0.0

        score = 0.0
        breakdown: Dict[str, Dict[str, Any]] = {}
        for pname, info in per_param.items():
            matched = info["matched"]
            w_opt   = float(info["option_weight"])
            maxw    = float(info["max_weight"])
            frac    = float(info["overall_fraction"])
            eff_frac = (frac * renorm) if (matched and present_sum > 0) else 0.0

            contrib = (w_opt / maxw) * eff_frac if (matched and maxw > 0) else 0.0
            score += contrib

            breakdown[pname] = {
                "row_value": info["row_value"],
                "option_weight": w_opt,
                "max_weight": maxw,
                "overall_fraction": frac,
                "matched": matched,
                "effective_fraction": eff_frac,
            }


        results.append({
            "row_index": i,
            "station_number": station_no,
            "site_name": site_name,
            "operation": operation,
            # multiply by 100 so the final looks like a percentage; keep 2dp
            "score": round(score * 100.0, 2),
            "details": breakdown,
        })

    # Sort highest score first and assign rank starting at 1
    results.sort(key=lambda r: (-r["score"], str(r.get("station_number") or ""), str(r.get("operation") or "")))
    for rank, entry in enumerate(results, start=1):
        entry["rank"] = rank

    return {
        "success": True,
        "optimized_count": len(results),
        "ranking": results,
        "notes": (
            "Scores use per-row re-normalization over present parameters so blanks are neutral. "
            "Option weights are divided by each parameter's max weight; overall weights are normalized to sum to 1."
        ),
    }