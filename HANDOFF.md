# spin-life — Handoff

Everything needed to pick this up cold. For the design rationale, read **[DESIGN.md](DESIGN.md)**.

## TL;DR

A "birth lottery" game: spin to be born into a random real-world life (country, name,
wealth, height, IQ, looks, lifespan, career), every probability weighted by real demographic
data — plus a **social-mobility layer** (family origin → adult destination) that turns each
roll into a shareable life story.

- **Live (phone-friendly):** https://lazyreflect.github.io/spin-life/
- **Repo:** https://github.com/lazyreflect/spin-life  (account `lazyreflect`, public)
- **Status:** working client-only prototype, deployed. Spin loop + life card + Lives history done.
  The model went through a major **realism overhaul** (2026-06) — see model notes below.
- **Auto-deploy:** push to `main` → GitHub Actions builds and publishes to Pages (~1 min).
- **Governing principle (updated):** **realism first.** This overrides DESIGN.md §2 ("not realism —
  surprise + story") and the "loud luck" dial — the project decision is that rolls must be
  *plausible*. Keep this in mind when reading DESIGN.md (parts predate the overhaul).

## Stack & decisions (resolved)

- **Vite + React + TypeScript**, client-only, **no backend**. State (spins, Lives) in `localStorage`.
- It's a clone+extension of **spinyour.life** (Expo/React-Native-Web original). We did NOT copy
  their code; we extracted their *data* and *math* and reimplemented.

## Repo map

```
data/
  countries.json       241 countries: births, netWorth(median), wealthGini, heightM/F, iq,
                       lifeM/F  + World Bank cols: empAg/empIndustry/empServices, femaleLFP,
                       secondaryEnrollment.  (extracted from original bundle + WB API)
  names.json           36 culture-cluster name lists (male/female first, last, countries[])
  careers.json         46-entry career catalog (sector, minEducation, trait tilts, incomeBand, prestige)
  model-params.json    calibrated trait-model parameters (copula matrices, mobility, lifespan)
src/
  model/               THE MODEL — plain .js ES modules, shared by sim AND app
    stats.js           randn, normCdf, invNorm (Acklam), cholesky, weighted sampling
    distributions.js   wealth (lognormal+Pareto) + mortality curve (both ported from original)
                       + global TOP% percentile fns
    content.js         names, education+career roll, formatting, class labels, sentence
    events.js          life-event catalog + rollEvents() (the structured "luck" layer)
    roll.js            makeRoller({countries,params,names,careers}) -> rollLife()  [orchestrator]
  ui/
    Wheel.tsx          conic-gradient spinning wheel (categorical OR value-bucket segments)
    SpinScreen.tsx     stage machine: steps through REVEAL_ORDER, holds on each landed value, → reveal
    revealStages.ts    builds the per-dimension reveal wheels (continent→country→wealth→height→IQ→looks→life)
    Card.tsx           editorial result card (serif life-story sentence, rarity, class arc, life-event chips, stat strip)
    Lives.tsx          history list, sorted by rarity
  App.tsx              tabs (Spin/Lives), spins counter + refill, localStorage
  data.ts             imports JSON, builds the roller, continent aggregation + colors
sim/
  simulate.mjs         model validation harness — drives the SHARED model (imports roll.js)
  cards.js             prints sample life-cards using the SHARED model
.github/workflows/deploy.yml   GitHub Pages deploy
```

## How the roll works (pipeline)

Per life (`roll.js → rollLife`) — see the model-architecture notes below for the *why*:
1. Pick **country** weighted by births; pick **sex** (51.2% M).
2. Draw correlated endowments `[famWealth, IQ, height, looks]` from a **Gaussian copula** (within country×sex).
3. Map to displayed: `IQ = adjCountryIq(countryIQ) + 15·z` (national IQ compressed toward 100, clamped 60–160); height/looks similarly; `parentRank = Φ(z_fw)`.
4. **Education → career:** education from IQ/family/enrollment (+ country floor); career filtered by education, weighted by employment-sector mix × IQ↔skill-demand alignment × over-qualification penalty × looks/height tilts.
5. **Destination wealth = two-component** `max(earned income, inherited-asset floor)`: income = career band (`CAREER_RANK`) + luck, renormalized, clamped to the career's `CAREER_RANGE`; assetFloor = `parentRank^1.4 · transferOf(Gini)` (convex). Both map to $ via the lognormal-Pareto quantile.
6. **Life events** (`events.js`): a few contextual, country-scaled events fire — shift wealth (may break career bounds: lottery/windfall), cut lifespan (fatal), add story.
7. **Lifespan:** national life expectancy + wealth + IQ adjustments → mortality sampler (low-LE countries have a tighter upper tail); events may cut it short. Early deaths (<18) skip career/class.
8. **Class** = OCCUPATION-based (`classOf`), **TOP%** percentiles, **rarity** (marginal + mobility-arc), class arc, deadpan sentence.

There are **no locked correlation targets anymore** (the original "calibrated trait model" was
replaced — see notes). `npm run sim` validates the model by *invariants* + emergent-correlation
sanity instead. Several `model-params.json` fields (`mobility.beta*`, `wIqIncome*`) are now legacy/unused.

## Commands

```bash
npm install
npm run dev        # local dev (http://localhost:5173)
npm run build      # production build -> dist/
npm run sim        # validate the model — invariants + correlations (200k lives, ~30s)
npm run cards      # print 10 sample life-cards in the terminal
```

Deploy = `git push origin main`. To watch: `gh run watch`. Pages source is already set to
"GitHub Actions" (build_type=workflow).

## Data provenance

World Bank (population/births, life expectancy, Gini, employment, enrollment), UBS Global
Wealth Databook (median net worth), NCD-RisC (height), per-country IQ estimates (IQ —
see caveat), ILO via World Bank (employment, female LFP), UNESCO/WB (enrollment). **Looks is
synthetic** (global 0–10 normal, no country data). Names = bundled culture lists.

## Open decisions / TODO

1. **IQ data (values call).** The per-country IQ estimates are the shakiest input and
   contentious. Decide: keep / replace / drop the dimension. It does NOT propagate
   deterministically (luck dominates every roll), but the raw numbers are visible on cards.
2. **Rarity** = `1/√(∏ pᵢ)` over the stat percentiles **plus a mobility-arc term** (big climbs/
   falls are rarer). Still a heuristic; the planned upgrade is an empirical fortune-score CDF (DESIGN §4.5).
3. **Project name** — `spin-life` is a working name; rename freely (relative-base build means a
   repo rename only changes the URL, nothing breaks).
4. **Deferred "Full Life" features** — marriage/partner (assortative), children/fertility,
   happiness, health/illness, crime, migration (brain-drain), cause of death, fame.
5. **Stub tabs** — original has Ranks (leaderboard, needs backend), Passport (241-country
   collection), Custom (build-a-life). Only Spin + Lives are built.
6. **Backend (someday)** — global leaderboard + account sync would need a server (deliberately
   out of scope for v1).

## Gotchas / notes

- **Spin flow (product decision, 2026-06):** the default now runs the FULL per-stat reveal
  sequence (continent→country→wealth→height→IQ→looks→life), restoring the original's "many
  spins" feel — overriding the earlier "spin speed is sacred / single fast reveal" default.
  Stages live in `revealStages.ts`; tune cadence via per-stage `durationMs` + `HOLD_MS` in
  `SpinScreen.tsx`. The whole life is rolled up front (`rollLife`), so reveal order is pure
  presentation — adding/removing/reordering stages never touches the model.
- **The card is the hero** — the deadpan one-line sentence is the viral asset; don't bloat it.
- **Realism pass (2026-06):** the model was tuned for plausible rolls (validated against
  external review of sample batches): national IQ compressed toward 100 (`adjCountryIq`, k=0.55);
  education has a country floor; mortality tail tightened (no centenarian floods); rarity is
  mobility-aware; **mobility luck `luckSd` 0.26 → 0.10** (strong dampening — realism over the
  old "loud luck" surprise dial); careers prefer matching the person's education + IQ↔skill
  demand; early deaths (<18) skip career/class. Tunable in `model-params.json` + `content.js`.
- **Class is OCCUPATION-based (2026-06), not net worth.** `classOf()` in `content.js`: each
  career has an occupational rank (`OCC_RANK`: laboring→ruling); class standing = 0.6·occupation
  + 0.4·wealth, then labelled. **"The elite" is the power elite** — a ruling career (`RULING`:
  entrepreneur/executive/politician) AND wealthy, OR dynastic controlling wealth (born top-2%
  AND still wealthy). A merely-rich lottery winner / top professional is "wealthy/upper", NOT
  elite. Realistic class shares (≈10/28/35/16/9/1%); elite ≈1%.
- **Event probabilities realistic + country-scaled (2026-06):** lottery ~1 in 1,400, serious
  illness ~1 in 14, etc. Adversity (war/famine/illness/accident/crime) scales with country
  `instabilityOf` (low-life-expectancy proxy); opportunity (business/lucky-break) scales with
  development; positive gains face diminishing rank-headroom (lottery exempt, so it can mint
  elite). Tune in `events.js`.
- **Life-event layer (2026-06):** discrete events (`src/model/events.js`) replace faceless
  Gaussian luck as the driver of TAIL outcomes — war/famine/illness/accident, windfall/lottery/
  inheritance, "built a thriving business" (the within-career upside a fixed income band can't
  express), ruin/scandal/addiction, emigration, marriage. They shift destination wealth in rank
  space and **may legitimately break the career bounds** (a lottery → elite cook), can cut the
  lifespan (fatal events), and surface on the card as story + in the sentence. ~39% of lives get
  ≥1 event; capped at 2. Adult-only events are suppressed for early deaths. Tune the catalog
  (probs/deltas) in `events.js`. (Event rate is now ~24% after the realistic-probability pass.)
- **Two-component wealth (2026-06):** destination wealth is `max(income, assetFloor)` —
  the better of (a) EARNED income: career-anchored (`CAREER_RANK` per band, `W_CAREER=0.55`)
  and bounded by the career's `CAREER_RANGE` [floor,ceiling]; and (b) an INHERITED-asset floor:
  `parentRank^1.4 · transferOf(Gini)`, convex (Pareto-concentrated — the genuinely rich retain
  a lot, the middle little) and peaking just below elite. This is the architectural fix for the
  heir-crash vs sticky-elite oscillation: a rich heir in a modest job is cushioned to
  "comfortable" (assets), a self-made earner climbs (income), and a sub-top career reaches
  ELITE only via dynastic inheritance (parentRank≳0.93), a top-tier career, or an event.
  Then life events apply, then class/net-worth derive from the final rank. Tune `CAREER_RANK`,
  `CAREER_RANGE`, `transferOf`, the `^1.4` convexity, and `luckSd` in `roll.js`/params.
  NOTE: `model-params.json` `mobility.beta*` / `wIqIncome*` are UNUSED (legacy).
- **`sim/simulate.mjs` now drives the SHARED model** (imports `src/model/roll.js`), so it
  validates what actually ships. Checks: structural copula corr (height↔looks); invariants —
  wealth rises monotonically with income band, **elite = power + wealth/dynasty** (0 unearned
  leaks), over-qualification rare, mean wealth-rank ≈ 0.5; and reports emergent correlations
  (IQ/edu/parent → wealth, IQ → lifespan), event rate, elite rate, + directional sanity.
  `npm run sim` rolls 200k full lives (~30s); pass a smaller N for a quick check (`node sim/simulate.mjs 40000`).
- Deploy workflow uses Node-20 actions (GitHub deprecation warning, non-blocking). Bump action
  versions / Node 24 when convenient.
- Original spinyour.life reference data lives only in this repo's `data/` now; the source bundle
  was at `/tmp/spinbundle.js` during extraction (not committed).

## Suggested next steps

1. Get the IQ-data decision made (it's the only values-sensitive item).
2. Eyeball rolls on a phone; tune card layout / pacing / coefficient feel.
3. Build the **Passport** tab (client-only, just a 241-country collection over localStorage —
   no backend needed) for the "gotta-catch-em-all" retention loop.
4. Add the **mobility arc as a headline** (it's the best shareable hook) and a share/screenshot button.
5. Upgrade rarity to the joint/empirical version.
