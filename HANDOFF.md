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
- **Auto-deploy:** push to `main` → GitHub Actions builds and publishes to Pages (~1 min).

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
    roll.js            makeRoller({countries,params,names,careers}) -> rollLife()  [orchestrator]
  ui/
    Wheel.tsx          conic-gradient spinning wheel (categorical OR value-bucket segments)
    SpinScreen.tsx     stage machine: steps through REVEAL_ORDER, holds on each landed value, → reveal
    revealStages.ts    builds the per-dimension reveal wheels (continent→country→wealth→height→IQ→looks→life)
    Card.tsx           the result card (sentence, rarity, class arc, career, 7 stats w/ TOP%)
    Lives.tsx          history list, sorted by rarity
  App.tsx              tabs (Spin/Lives), spins counter + refill, localStorage
  data.ts             imports JSON, builds the roller, continent aggregation + colors
sim/
  simulate.mjs         model validation harness (correlation targets) — inline model copy
  cards.js             prints sample life-cards using the SHARED model
.github/workflows/deploy.yml   GitHub Pages deploy
```

## How the roll works (pipeline)

Per life (`roll.js → rollLife`):
1. Pick **country** weighted by births; pick **sex** (51.2% M).
2. Draw correlated endowments `[famWealth, IQ, height, looks]` from a **Gaussian copula**
   (sex-specific matrix, within country×sex).
3. Map to displayed values: `IQ = countryIQ + 15·z`, height/looks similarly; `parentRank = Φ(z_fw)`.
4. **Destination wealth (mobility):** `childRank = Φ((β·parentRank + (1-β)·0.5 + premiums + luck − μ)/σ)`,
   `β` from Gini (Great Gatsby curve). Maps to $ via lognormal-Pareto quantile.
5. **Lifespan:** base life expectancy + wealth adjustment + IQ adjustment → sample age from the
   ported mortality curve.
6. **Education + career:** education from IQ/family/enrollment/sex; career filtered by education,
   weighted by the country's employment-sector mix.
7. **TOP%** for each stat (population-weighted across all countries), **rarity**, **class arc**.

Calibration is locked in `model-params.json`; `npm run sim` re-checks all 8 correlation
targets (currently green). Mean is 0.5 by symmetry; `roll.js` measures childRaw σ once at init.

## Commands

```bash
npm install
npm run dev        # local dev (http://localhost:5173)
npm run build      # production build -> dist/
npm run sim        # validate trait-model correlations (200k lives)
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
2. **Rarity** is still the marginal-product placeholder `1/√(∏ pᵢ)`, which overstates rarity for
   correlated lucky combos. Planned upgrade: empirical fortune-score distribution (DESIGN §4.5).
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
- The model is duplicated in `sim/simulate.mjs` (inline, the validation oracle) vs `src/model/`
  (shared). Keep them in sync if you change coefficients, or refactor simulate.mjs to import the
  shared model.
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
