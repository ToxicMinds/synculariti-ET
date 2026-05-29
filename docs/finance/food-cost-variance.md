# Food Cost Variance (FCV) Report

## What It Measures

The gap between **what you actually spent on ingredients** (purchases ledger) and **what you should have spent based on what you sold** (POS sales × recipe portions).

```
FCV = Actual Spend − Theoretical COGS
```

- **Positive gap** (BLEEDING): You spent more than recipes predict. Waste, theft, portion creep, or unrecorded usage.
- **Negative gap** (PROFITABLE): You spent less than recipes predict. Possibly using cheaper substitutes, bulk discounts, or inventory drawdown.
- **Near zero** (NEUTRAL): Purchases match consumption. Your kitchen is running to spec.

## Core Formulas

### 1. Theoretical COGS

```
For each ingredient in each POS receipt item:
  grams_consumed = quantity_sold × grams_per_portion
  cost_at_latest_price = grams_consumed × cost_per_gram (from IMS recipe API)

Total Theoretical COGS = SUM(cost_at_latest_price across all POS items in period)
```

Source: `pos_transaction_staging.theoretical_grams` (populated by `resolveConsumption()`).

### 2. Actual Spend

```
Total Actual Spend = SUM(purchases.total_amount) for ingredient-level purchases in period
```

Source: `purchases` table, filtered by `purchase_date` within the report period.

### 3. Gap (Variance)

```
Gap (€) = Actual Spend − Theoretical COGS
Gap (%) = (Actual Spend − Theoretical COGS) / Theoretical COGS × 100
```

When Theoretical COGS = 0 (no POS data or unresolved recipes), gap % is undefined (NULL).

### 4. Total Revenue

```
Total Revenue = SUM(pos_transaction_staging.revenue) for POS items in period
```

Used for context and the NEUTRAL threshold check (gap must be > 5% of revenue to flag as BLEEDING).

## Direction Logic

The report assigns one of three directions based on gap size relative to total revenue:

| Condition | Direction | Meaning |
|-----------|-----------|---------|
| `gap > revenue × 0.05` | `BLEEDING` | Spend meaningfully exceeds consumption |
| `gap < −revenue × 0.05` | `PROFITABLE` | Spend meaningfully below consumption |
| Everything else | `NEUTRAL` | Within normal range (±5% of revenue) |

**Rationale for 5% threshold:** Restaurant COGS averages 28-35% of revenue. A 5% gap on revenue ≈ 15-18% swing on COGS itself — large enough to warrant investigation but not so tight it triggers on daily noise.

## Variance Spike Flags

Per-day comparison of actual spend vs theoretical COGS:

| Condition | Flag | Meaning |
|-----------|------|---------|
| `actual > theoretical × 1.3` | `HIGH_VARIANCE` | Spend 30%+ above expectation |
| `actual < theoretical × 0.7` | `NEGATIVE_VARIANCE` | Spend 30%+ below expectation |
| All other | `NORMAL` | Within ±30% band |

**Rationale for 30% band:** Daily POS data is noisy (weekend rushes, staff meals, comps). ±30% on a single day is the threshold where manual review is warranted. The weekly and monthly aggregates smooth this — a single bad day rarely moves the monthly number.

## Per-Ingredient Gap

```
For each ingredient_id:
  actual_cost = SUM of purchases.total_amount for that ingredient
  theoretical_cost = SUM of theoretical_grams data for that ingredient
  gap = actual_cost − theoretical_cost
  gap_pct = (actual_cost − theoretical_cost) / theoretical_cost × 100
  share_of_total_gap = ingredient_gap / SUM(all_ingredient_gaps)
```

Ingredients are sorted by `|gap|` descending. The top 3-5 are surfaced in the report.

## Data Coverage

```
coverage_pct = days_with_POS_data / days_in_period × 100
```

- `days_with_POS_data`: distinct calendar dates in `pos_transaction_staging.transaction_time`
- `days_in_period`: total calendar days in the report period
- When coverage < 100%, the gap estimate has uncertainty:
  - **> 90%**: confidence is high (no warning)
  - **70-90%**: warning shown — "POS data missing for N days"
  - **< 70%**: strong warning — recommendation engine disabled, report shows ±15% confidence band

## Weekly Trend

POS data and purchases are grouped by ISO week (`YYYY-Www` format, computed from `transaction_time` and `purchase_date`). Each week shows:
- revenue, theoretical COGS, actual spend, gap

Weeks with no data are still included in the trend array (values = 0) to preserve the visual timeline.

## Confidence Bands

```
gap_lower = gap × (1 − uncertainty_pct)
gap_upper = gap × (1 + uncertainty_pct)

uncertainty_pct = max(0, 1 − coverage_pct / 100) × 0.5
```

This means:
- 100% coverage → uncertainty = 0%, bands = gap
- 80% coverage → uncertainty = 10%, bands = gap ± 10%
- 50% coverage → uncertainty = 25%, bands = gap ± 25%
- 0% coverage → uncertainty = 50%, bands = gap ± 50% (effectively useless)

## Implementation Notes

- All monetary values use `NUMERIC(12,2)` precision in the DB and are rounded to 2 decimal places in the report.
- `purchases` total_amount already excludes VAT (standardized in the scanner pipeline).
- `theoretical_grams` cost is computed using `cost_per_gram` from the IMS recipe API, which may be NULL → treated as 0 (ingredient treated as free).
- Dates are compared at the day level (`YYYY-MM-DD`), not including time, for filtering and grouping.
