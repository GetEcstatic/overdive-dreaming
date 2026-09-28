I want to create an example data set following 3 years worth of freedive training data with relevant metrics for the overdive app. Specifically I want to track matrics for:
- static maximal attempts
- Rv breath hold series routine

The dataset should be displayed as an excel spread sheet for the moment.
We'll assume all the training is dry and spo2 and heart rate are tracked.

The data is semi-developed from real data of Tom.way.singapore@gmail.com (account on overdive)

The athlete typically conducts 2-3 months of periodised training prior to strong competition results for that year. There are a maximum of 2 or 3 training cycles per year.

TASK: 
1. identify metrics that would be useful to track for this athlelete.
2. understand the real metrics provided below and how these might fit in to periodised cycles of training (undersdtand that poor results don't usually correlate with poor training performance.)
3. Create a spreadsheet that could be used to record all relevant data for both the static max attempts and the RV max attempts. Add all useful metrics
4. Understand that training during cycles includes a minimum of 3x RV series sessions per week plus 2 full lung trainings per week. The majority of cycle is breath holds between 65-85% of the previous cycles PB time. Only the final 10 days (peaking) of a cycle are where times are slowly increased with each session until the equal or surpass PB times. Competition times tend to be 15-30s below training PBs.
5. Between training cycles training usually includes 1 RV series and 1x FL maintenance holds. These typically fall at around 75% max/PB numbers.

Plan the implementation of this spreadsheet in this md file. Add any questions you need answered.

Below this there is some useful data:

# AIDA Competition results

Here is real data from all AIDA competition results. Only STA results are noteworthy and can help develop a trend for the STA Data

|**Competition**|**Date**|**Discipline**|**Result Nationality**|**Announced performance**|**Realised performance**|**Card**|**Points**|**Remarks**|
|---|---|---|---|---|---|---|---|---|
|![Gold](https://www.aidainternational.org/assets/img/medal-gold.svg "Gold medal")|**AIDA Finqualizer: Molchanovs CORE Challenge 2025**|**2025/12/20**|**STA**|**United Kingdom**|**05:00**|**06:30**|**White**|**78**|**White**|
|![Bronze](https://www.aidainternational.org/assets/img/medal-bronze.svg "Bronze medal")|**Indonesia National AIDA Freediving Championship 2025**|**2025/12/20**|**DNF**|**United Kingdom**|**5 m**|**65 m**|**White**|**32.5**|**White**|
|![Gold](https://www.aidainternational.org/assets/img/medal-gold.svg "Gold medal")|**Indonesia National AIDA Freediving Championship 2025**|**2025/12/19**|**STA**|**United Kingdom**|**07:00**|**08:31**NR****|**White**|**102.2**|**White**|
||**AIDA Get EcSTAtic! (Back To The) Unknown**|**2025/09/15**|**STA**|**United Kingdom**|**06:00**|**06:06**|**White**|**73.2**|**White**|
||**AIDA Get EcSTAtic! (Into The) Unknown**|**2025/09/14**|**STA**|**United Kingdom**|**06:00**|**07:02**|**White**|**84.4**|**White**|
||**AIDA Get EcSTAtic! (Back To The) Unknown**|**2025/09/14**|**STA**|**United Kingdom**|**06:00**|**06:00**|**White**|**72**|**White**|
||**AIDA Get EcSTAtic! (Back To The) Unknown**|**2025/09/13**|**STA**|**United Kingdom**|**06:00**|**06:31**|**White**|**78.2**|**White**|
|![Gold](https://www.aidainternational.org/assets/img/medal-gold.svg "Gold medal")|**AIDA Get EcSTAtic! Road to Wakayama**|**2025/06/08**|**STA**|**United Kingdom**|**00:01**|**08:02**|**White**|**96.4**|**White**|
||**AIDA Get EcSTAtic! Road to Wakayama**|**2025/06/07**|**STA**|**United Kingdom**|**00:01**|**06:33**|**White**|**78.6**|**White**|
|![Gold](https://www.aidainternational.org/assets/img/medal-gold.svg "Gold medal")|**AIDA GetEcstatic Olympiad 2024 Round 2**|**2024/08/10**|**STA**|**United Kingdom**|**07:00**|**07:32**|**White**|**90.4**|**White**|
|![Gold](https://www.aidainternational.org/assets/img/medal-gold.svg "Gold medal")|**AIDA GETECSTATIC 2024 MAY SPRITZ COMP 2**|**2024/05/11**|**STA**|**United Kingdom**|**00:21**|**08:22**|**White**|**100.4**|**White**|
|![Silver](https://www.aidainternational.org/assets/img/medal-silver.svg "Silver medal")|**AIDA GETECSTATIC 2024 MAY SPRITZ COMP 1**|**2024/05/11**|**STA**|**United Kingdom**|**00:20**|**06:01**|**White**|**72.2**|**White**|
|![Silver](https://www.aidainternational.org/assets/img/medal-silver.svg "Silver medal")|**UFC 8 AIDA**|**2024/05/05**|**STA**|**United Kingdom**|**06:00**|**06:31**|**White**|**78.2**|**White**|
|![Bronze](https://www.aidainternational.org/assets/img/medal-bronze.svg "Bronze medal")|**AIDA - Ultimate Static Apnea League Round Beta3 - Singapore**|**2023/12/16**|**STA**|**United Kingdom**|**00:01**|**05:37**|**White**|**67.4**|**White**|
||**AIDA Ultimate Freediving Challenge 7**|**2023/12/03**|**DYNB**|**United Kingdom**|**101 m**|**84 m**|**Yellow**|**33.5**|**Yellow, under ap**|
|![Silver](https://www.aidainternational.org/assets/img/medal-silver.svg "Silver medal")|**AIDA - Ultimate Static Apnea League Round Beta2 - Singapore**|**2023/10/08**|**STA**|**United Kingdom**|**05:30**|**06:02**|**White**|**72.4**|**White**|
|![Gold](https://www.aidainternational.org/assets/img/medal-gold.svg "Gold medal")|**AIDA GetEcSTAtic! - Summer Buzz**|**2023/08/06**|**STA**|**United Kingdom**|**03:20**|**07:50**|**White**|**94**|**White**|
|![Silver](https://www.aidainternational.org/assets/img/medal-silver.svg "Silver medal")|**AIDA GetMoreEcSTAtic! Summer Buzz**|**2023/08/06**|**STA**|**United Kingdom**|**03:20**|**05:30**|**White**|**66**|**White**|
||**30th AIDA POOL WORLD CHAMPIONSHIP**|**2023/06/16**|**DYN**|**United Kingdom**|**10 m**|**126 m**|**White**|**63**|**White**|
||**30th AIDA POOL WORLD CHAMPIONSHIP**|**2023/06/15**|**STA**|**United Kingdom**|**03:30**|**05:46**|**White**|**69.2**|**White**|
||**30th AIDA POOL WORLD CHAMPIONSHIP**|**2023/06/12**|**DYNB**|**United Kingdom**|**10 m**|**110 m**|**White**|**55**|**White**|
|![Silver](https://www.aidainternational.org/assets/img/medal-silver.svg "Silver medal")|**AIDA UFC 5.5 : Road to Jeju**|**2023/06/04**|**DYNB**|**United Kingdom**|**51 m**|**121 m**|**White**|**60.5**|**White**|
|![Gold](https://www.aidainternational.org/assets/img/medal-gold.svg "Gold medal")|**AIDA UFC 5.5 : Road to Jeju**|**2023/06/03**|**STA**|**United Kingdom**|**03:00**|**06:16**|**Yellow**|**74.2**|**Yellow, latestart**|
|![Gold](https://www.aidainternational.org/assets/img/medal-gold.svg "Gold medal")|**AIDA A42 Flow State Competition**|**2023/03/19**|**STA**|**United Kingdom**|**00:01**|**07:20**|**White**|**88**|**White**|
|![Gold](https://www.aidainternational.org/assets/img/medal-gold.svg "Gold medal")|**AIDA A42 Dream State Comp**|**2023/03/14**|**STA**|**United Kingdom**|**06:00**|**06:46**|**White**|**81.2**|**White**|
||**AIDA One Breath 2023**|**2023/02/18**|**STA**|**United Kingdom**|**06:00**|**07:18**|**Red**|**0**|**Red, dqairways**|
|![Silver](https://www.aidainternational.org/assets/img/medal-silver.svg "Silver medal")|**AIDA One Breath 2023**|**2023/02/11**|**STA**|**United Kingdom**|**00:01**|**06:15**|**White**|**75**|**White**|
|![Gold](https://www.aidainternational.org/assets/img/medal-gold.svg "Gold medal")|**AIDA Get EcSTAtic! - Last Chance 2022**|**2022/12/17**|**STA**|**United Kingdom**|**00:02**|**05:01**|**White**|**60.2**|**White**|
|![Bronze](https://www.aidainternational.org/assets/img/medal-bronze.svg "Bronze medal")|**AIDA Ultimate Freediving Challenge 4**|**2022/12/05**|**DYNB**|**United Kingdom**|**102 m**|**77 m**|**Yellow**|**26**|**Yellow, under ap**|
|![Silver](https://www.aidainternational.org/assets/img/medal-silver.svg "Silver medal")|**AIDA APNEA SG STATIC 2022**|**2022/10/02**|**STA**|**United Kingdom**|**03:00**|**05:31**|**White**|**66.2**|**White**|
||**AIDA Ultimate Freediving Challenge - 3**|**2022/08/27**|**DYNB**|**United Kingdom**|**80 m**|**100 m**|**White**|**50**|**White**|
|![Gold](https://www.aidainternational.org/assets/img/medal-gold.svg "Gold medal")|**Get EcSTAtic AIDA Competition**|**2022/06/12**|**STA**|**United Kingdom**|**00:01**|**07:07**|**White**|**85.4**|**White**|
||**AIDA A42 STA MINI 2022**|**2022/04/24**|**STA**|**United Kingdom**|**00:01**|**03:53**|**Red**|**0**|**Red, dqairways**|
|![Gold](https://www.aidainternational.org/assets/img/medal-gold.svg "Gold medal")|**AAS AIDA Mini Comp 2022**|**2022/02/19**|**STA**|**United Kingdom**|**00:01**|**06:18**|**White**|**75.6**|**White**|
||**AAS AIDA Mini Comp 2022**|**2022/02/19**|**DNF**|**United Kingdom**|**1 m**|**56 m**|**White**|**28**|**White**|
|![Gold](https://www.aidainternational.org/assets/img/medal-gold.svg "Gold medal")|**AIDA ecSTAtic Club Comp Privée**|**2021/12/28**|**STA**|**United Kingdom**|**00:01**|**05:07**|**White**|**61.4**|**White**|
|![Silver](https://www.aidainternational.org/assets/img/medal-silver.svg "Silver medal")|**A42 AIDA DYNAMIC**|**2021/10/26**|**DYNB**|**United Kingdom**|**60 m**|**78 m**|**White**|**39**|**White**|
||**A42 AIDA STATIC**|**2021/09/24**|**STA**|**United Kingdom**|**03:00**|**06:26**|**Red**|**0**|**Red, dqairways**|

# Rv trends by year

## 2021
Max RV: 2:40
Minimum spo2%: 45

## 2022
Max RV: 3:11
Minimum spo2%: 42

## 2023
Max RV: 3:45
Minimum spo2%: <35 (pulse oximeter won't read below 35%)
This is where "time below %" thresholds become more relevant.
Time below 40%: 22 seconds
# 2024
Max RV: 3:45
Minimum spo2%: <35 (pulse oximeter won't read below 35%)
Time below 40%: 15s

# 2025
Max RV: 4:02
Minimum spo2%: <35 (pulse oximeter won't read below 35%)
Time below 40%: 25s

# 2026
Max RV: 4:15
Minimum spo2%: <35 (pulse oximeter won't read below 35%)
Time below 40%: 25s


# Spirometer data
## 2021
FVC: 5.9L
FVC + packing: 6.8L

## 2022
FVC: 6.2
FVC + packing: 7.5L

## 2023
FVC: 6.8L
FVC + packing: 8.0L
# 2024
FVC: 7.2L
FVC + packing: 8.3L

# 2025
FVC: 7.3L
FVC + packing: 8.5L

# 2026
FVC: 6.8L
FVC + packing: 7.8L

---

# IMPLEMENTATION PLAN (drafted by Claude — review + answer questions before I generate the file)

## 0. What I read from the real data

**STA competition white-card bests by year (realised performance):**

| Year | Comp STA best | Implied training PB (+15–30 s) | Max RV | FVC | FVC+pack | Min SpO₂ | Notes |
|---|---|---|---|---|---|---|---|
| 2021 | 5:07 | ~5:25–5:40 | 2:40 | 5.9 | 6.8 | 45% | First year; 6:26 attempt went RED (DQ airways) |
| 2022 | 7:07 | ~7:25–7:40 | 3:11 | 6.2 | 7.5 | 42% | Big jump |
| 2023 | 7:50 | ~8:05–8:20 | 3:45 | 6.8 | 8.0 | <35% | Time<40% = 22 s; pulse-ox floors at 35% |
| 2024 | 8:22 | ~8:40–8:55 | 3:45 | 7.2 | 8.3 | <35% | Time<40% = 15 s |
| 2025 | 8:31 NR | ~8:45–9:00 | 4:02 | 7.3 | 8.5 | <35% | National Record; Time<40% = 25 s |
| 2026 | — (none logged) | — | 4:15 | **6.8 ↓** | **7.8 ↓** | <35% | Time<40% = 25 s. **FVC dropped while RV rose — see Q8** |

**Key modelling rules pulled from the brief:**
- 2–3 periodised cycles/year, each 2–3 months, peaking into a competition cluster.
- Bulk of cycle = holds at **65–85%** of *previous cycle's* PB time.
- Final **10 days = peaking**: each session steps up until it equals/beats PB.
- In-cycle volume: **≥3× RV series/week + 2× full-lung (FL) sessions/week**.
- Between cycles: **1× RV series + 1× FL maintenance/week @ ~75%**.
- Comp performances land **15–30 s below training PBs**, and **poor comp results ≠ poor training** (so synthetic comp days should sometimes underperform training even in a good block).

**Inferred cycle/comp clusters (from comp dates) to anchor the periodisation:**
- 2023: Feb–Mar, Jun, Aug, Oct, Dec (training-heavy year, ~3 effective peaks).
- 2024: May, Aug (2 cycles).
- 2025: Jun, Sep, Dec (3 cycles).

## 1. Metrics to track (the useful set)

Following the project's data-oriented rule, each sheet is a flat table of plain rows; analytics are *derived* (computed columns / summary sheet), never duplicated as a second source of truth.

**Shared per-session context:** Date · Year · Cycle ID · Phase (`off-season` / `base` / `build` / `peak` / `competition`) · Day-in-cycle · Days-to-comp · Session type · Body weight (kg) · Sleep (h) · Hours since last meal · Resting HR · RPE (1–10) · Mental readiness (1–10) · Notes.

**STA Max-Attempt sheet (per attempt):** Lung volume (FL / FL+packing) · Packing count · Breathe-up duration · **Total hold time** · % of current PB · Target time · **Contraction onset** (time to 1st contraction) · Contraction count · Struggle-phase duration · **SpO₂ min** · SpO₂ at recovery · **Time below 40%** · **Min HR (dive-reflex bradycardia)** · Recovery HR (1 min) · Recovery quality (clean / samba / LMC) · Result (training / white / yellow / red).

**RV Series sheet (per session, series-level + per-hold):** Series structure (N holds × target, rest protocol) · Lung volume (RV / FRC / passive-exhale) · Per-hold rows: hold #, duration, SpO₂ min, time<40%, min HR, contraction onset, rest after · Series-level: **max RV hold**, total apnea time, SpO₂ nadir across series, % of RV PB.

**Spirometry sheet (periodic):** Date · FVC · FVC+packing · Packing gain (derived) · Notes.

**Derived/analytics:** RV:FL ratio (RV max ÷ STA training PB) · PB progression curve · per-cycle % gain · SpO₂ tolerance trend (min SpO₂ & time<40% over years).

## 2. Proposed Excel workbook structure (multi-tab .xlsx)

1. **README / Legend** — column definitions, units, phase colour key.
2. **STA Max Attempts** — one row per max/sub-max attempt (training + comp).
3. **RV Series** — one row per hold (grouped by session) OR session-summary rows (see Q6).
4. **Spirometry** — periodic FVC log.
5. **Competition Results** — the real AIDA STA table, normalised (date, announced, realised, card, points).
6. **Cycles** — one row per training cycle (start, end, peak comp, PB target, achieved).
7. **Annual Summary** — PB, max RV, FVC, RV:FL ratio, SpO₂ trend per year (charts here).

## 3. Generation approach (data-oriented, side-effects at the edge)

- A small **Python script** (`generate_dataset.py`, openpyxl) committed alongside the .xlsx so the data is reproducible.
- **Pure layer:** plain config data (cycle calendar, PB-by-year, % bands, RV structure) → pure functions that produce row dictionaries. Deterministic seed so re-runs are identical.
- **Edge layer:** openpyxl writes rows + formatting + charts. No business logic in the writer.
- Volume: in-cycle weeks generate ~3 RV + 2 FL rows/week at 65–85% PB; final 10 days ramp to PB; between-cycle weeks generate ~1 RV + 1 FL @ ~75%; comp days emit a Competition row 15–30 s under the contemporaneous training PB, occasionally underperforming.

## 4. Open questions (please answer inline)

1. **Time span:** Full 2021–2026, or focus the detailed 3 years on 2023–2025 (richest comp data) with 2021–22 as summary only? Brief says "3 years." *Yes, let's focus on 2023-December 2025 plus maintenance training only in 2026. 3-1/2 years only in total*
2. **Deliverable:** OK to commit a reproducible **Python + openpyxl script** plus the generated `.xlsx`? (Confirm Python is fine vs. a hand-built single .xlsx, or you'd prefer CSVs.) *Yes this is fine*
3. **Granularity:** Log **every session** (~5/week in-cycle) for realism, or only the notable max/PB attempts? *Log every session, and create natural variance in the number of session per week as these would vary depending on health etc. in a real world situation*
4. **RV series structure:** What's the typical protocol? e.g. how many holds per series, fixed rest or to-recovery, and is it true RV (forced exhale + reverse pack), FRC, or passive exhale? Packing on RV holds? *As per the overdive dreaming App RV series (please refer to this for key metrics and structure)*
5. **Full-lung (FL) sessions:** The title scopes to "STA max + RV series," but training includes 2× FL/week. Should FL sessions get their own rows/sheet, or only RV + STA max attempts? *STA max is synonymous with full lung sessions. Although we call them STA "max" the reality is that they are only true max during the final peaking series of a training cycle. Earlier STA max attempts are more likely sub-max.*
6. **SpO₂/HR detail:** Excel can only hold summary values well — capture **min/key values per attempt** (recommended), or do you also want per-hold time-series within RV series? *I'd like minimum spo2 values primary, but also "Time below spo2 thresholds" (See overdive dreaming app for information on these*
7. **HR baselines:** Any real resting / min (bradycardia) / recovery HR numbers to anchor to? Otherwise I'll model plausible values (e.g. resting ~50, dive-reflex min ~35–40). *Record minimum HR values only. These are quite variable with 75-95bpm being quite normal for FL holds until the peaking stage of a cycle when they might drop as low as 59bpm. RV holds are typical lower with 55-65bpm begin quite normal until the final peaking part of a series where it might drop as low as 45bpm*
8. **2026 spirometry drop:** FVC fell 7.3→6.8 and FVC+pack 8.5→7.8 while Max RV *rose* to 4:15 — intentional (illness / detrain / measurement) or a typo? It changes how I model 2026. *this reflects detraining and a lack of stretching. Lung size tends to be biggest immediately prior to big performances.*
9. **Cycle calendar:** Should I infer cycle windows purely from the comp date clusters above, or do you want to specify exact start/peak dates per cycle? *Try to infer them as best as possible. On occasion bad comp results reflect a lack of training. Aim for 2cycles per year around the best comp results*
10. **Units / locale:** Times as `mm:ss` strings, or total seconds (better for charts), or both columns? *Time in mm:ss please*

## 5. Resolved design (locked in from answers above)

- **Span:** 2023-01 → 2025-12 fully detailed; **2026 = maintenance only** (Jan–Jun, ~1 RV + 1 FL/week @ ~75%, detraining). ~3.5 years.
- **Deliverable:** reproducible `generate_dataset.py` (openpyxl, seeded) + generated `overdive_training_dataset.xlsx`, both in `docs/Sims/`.
- **Granularity:** every session logged; **natural week-to-week variance** in session count (illness/life → occasional light or missed weeks).
- **2 cycles/year**, anchored to the strongest comp clusters: 2023 (peak Mar & Aug), 2024 (peak May & Aug), 2025 (peak Jun & Dec). Off-peak comps can underperform (poor comp ≠ poor training).
- **STA = Full-Lung (FL) sessions.** Bulk of cycle is `submax` (65–85% of previous cycle's PB); only the final-10-day peaking block is true `max`. Comps land 15–30 s under the contemporaneous training PB.
- **RV series** modelled on the app's *Dry RV Table*: **8 reps, RV (full-exhale) start, dry**, per-rep duration + min SpO₂ + min HR + contraction onset; session summary = longest hold, total apnea time, SpO₂ nadir, time-below-threshold.
- **Biometrics (from the app):** primary **min SpO₂** + **time-below-SpO₂ thresholds 70/60/50/40%** (athlete floors at 35% on the pulse-ox, so 40% is the live metric). HR = **min HR only** — FL 75–95 bpm (→ ~59 peaking), RV 55–65 bpm (→ ~45 peaking).
- **Spirometry:** logged periodically, peaks just before big performances; 2026 lower (6.8 / 7.8) reflecting detrain + less stretching.
- **Times displayed as `mm:ss`** (with parallel `(s)` seconds columns where charts need them).

### Workbook tabs (final)
1. README / Legend  2. STA Full-Lung Sessions  3. RV Series (session summary)  4. RV Series (per rep)  5. Spirometry  6. Competition Results (real AIDA)  7. Cycles  8. Annual Summary (+ charts)

