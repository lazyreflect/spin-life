# Spin Your Life (clone) — Design Doc

A "birth lottery" game: spin to be born into a random real-world life — country, name,
wealth, height, IQ, looks, lifespan — with every probability weighted by real demographic
data. This clone keeps the original's feel and adds a **social-mobility / life-trajectory**
layer that turns each roll into a little story.

Status: design locked, math calibrated, no app built yet.

---

## 1. The original (baseline)

- One "life" = a **sequence of per-dimension wheel spins**: sex → continent → country →
  wealth → height → IQ → looks → lifespan → name. Each is its own spin; later wheels are
  built from earlier picks (the lifespan wheel already reads the rolled wealth).
- 6 stats drawn **conditionally independent given country**, with the *only* cross-link
  being **wealth → lifespan** (±5/+7 yrs).
- Rarity = `1 / √(∏ pᵢ)` over money, height, IQ, life, looks.
- Tabs: **Spin / Lives / Ranks / Passport / Custom**. 100 free spins. Account backup/import.
- Data per country: `births, netWorth(median), wealthGini, heightM, heightF, iq, lifeM, lifeF`.
  Names = 37 cultural clusters (each maps many countries → name lists, continent fallback).
  Looks = a global synthetic 0–10 curve (no per-country data).
- Sourced from World Bank + UBS (credited); height = NCD-RisC and IQ = per-country
  estimates (used but **not** credited in the original). `data/countries.json` here is
  extracted verbatim from the original bundle (241 countries).

## 2. Governing principle

Goal is **not realism — it's surprise + story**, in service of two replay loops:
*"lol look at this roll" (share)* and *"spin again for a rare one" (chase)*.

Every change must pass: **does it raise variance / create irony / add a collectible?**
Keep it. **Does it just add predictability or reveal time?** Cut it.

Master dial (serves replayability *and* avoids deterministic stereotyping):
**small coefficients, loud fat-tailed luck.** Traits tilt odds; they never dictate.
The exceptions are the content.

## 3. Changes from the original

### Core (the keeps)

1. **Two-stage wealth: family origin → adult destination.** Roll the parents' wealth, then
   compute the adult outcome via a mobility equation (§math). Adds a *trajectory*.
2. **Mobility from Gini** (Great Gatsby curve): persistence `β` rises with inequality, using
   data we already store. No new dataset.
3. **Birth-level trait correlations** via a Gaussian copula: height↔looks (sex-modified),
   height↔IQ, IQ↔family-wealth — all small. Preserves every marginal exactly.
4. **Causal premiums → destination wealth:** IQ, looks, height tilt adult wealth (routed
   through career once the career layer exists, to avoid double-counting).
5. **IQ → lifespan** (new, cognitive-epidemiology); **dropped** height→lifespan and
   looks→lifespan (weak / confusing). Lifespan links = wealth (kept) + IQ (new).
6. **New shareable stats:** family wealth, net worth, **mobility delta** ("▲ climbed 42 pts"),
   **class arc** ("born elite → died working class"), self-made vs inherited.
7. **New rarity axes:** rare *arcs*, rare *careers*, rare *events* — collectibles for the
   chase loop / leaderboard / Passport.

### Deferred ("Full Life" mode / later)

Career line (education → occupation → income), marriage/partner (assortative), children /
fertility, happiness, health/illness, crime, urban-vs-rural, religion, cause of death, fame,
**migration** (brain-drain: changes effective country mid-life). Each is cheap (a country
number or two + a formula) but additive flavor — keep out of the default fast spin.

Career data: see **`data/careers.json`** (~107 entries, incl. skilled trades, care/health
mid-tier, logistics, modern services, the informal economy, and not-in-work states) and
the roll algorithm in §4.6. The country/culture match is **structural, not hand-assigned**:
a country's employment mix weights which jobs appear, so a poor ag economy surfaces
farmers/laborers and a rich one surfaces professionals — without us caricaturing any culture.
Uses 7 country columns (`empAg/empIndustry/empServices, femaleLFP, secondaryEnrollment`
from World Bank / UNESCO, plus `vulnEmployment` SL.EMP.VULN.ZS and `unemployment`
SL.UEM.TOTL.ZS) — **all fetched & merged** (`sim/fetch-labor.mjs` pulls the labor pair).
Not a 241×N matrix.

### Cross-cutting rules

- **Spin speed is sacred.** Default = fast single reveal. Deep life-story = expandable card
  or opt-in "Full Life" mode. Never serialize every feature into the reveal.
- **The card is the hero.** The deadpan one-line life story is the viral asset; features
  enrich the sentence, not bloat it into a spreadsheet.
- **Reveal order ≠ correlation structure.** Draw correlated traits once (copula) up front,
  then reveal stage-by-stage on the wheels. UX order is pure presentation.

---

## 4. Math spec (calibrated — locked)

Numbers live in `data/model-params.json`; validated by `sim/simulate.mjs`.

### 4.1 Endowment draw (copula)
At birth, draw `z = [z_famWealth, z_IQ, z_height, z_looks]` ~ correlated standard normals,
**within country × sex**: `n ~ N(0,I₄); z = chol(R)·n`. `R` is sex-specific (height↔looks
0.20 M / 0.10 F); all other off-diagonals ≤ 0.15. The `z` values ARE the within-country
standardized scores used downstream.

### 4.2 Latent → displayed marginals (distributions unchanged)
```
parentRank   = Φ(z_famWealth)                         // "born into" wealth rank
familyWealth$ = countryWealthQuantile(parentRank)     // existing lognormal-Pareto
IQ           = countryIQ + 15·z_IQ
height_cm    = countryHeight(sex) + (7.5 M | 6.7 F)·z_height
looks        = 5.0 + 2.0·z_looks                      // global 0–10, no country input
```

### 4.3 Destination wealth (mobility) — rank space
```
β = clamp(0.25 + 0.006·(Gini − 30), 0.20, 0.60)
childRaw = β·parentRank + (1−β)·0.5
         + 0.065·z_IQ + 0.022·z_looks + 0.010·z_height
         + N(0, 0.26²)                                // luck — dominant
childRank = Φ((childRaw − μ)/σ)                        // re-spread to preserve dispersion
finalWealth$ = countryWealthQuantile(childRank)
```
When the career layer is ON, the IQ/looks/height terms move *into* career→income and are
removed here (route the premium once).

### 4.4 Lifespan
```
meanLife  = (sex==F ? lifeF : lifeM)
          + wealthLifeAdj(childRank)                  // existing curve: +7 rich … −5 poor
          + 1.05·z_IQ                                 // new
ageAtDeath ~ existing mortality-curve sampler(meanLife)
```
(Sim uses a simplified normal mortality, σ≈14, for the correlation check; port the real
infant-mortality-inclusive sampler for production.)

### 4.5 Rarity (correlation-correct)
Replace `1/√(∏ pᵢ)` with an **empirical reference distribution**: simulate ~1M lives once,
define a scalar **fortune score** (weighted standardized outcomes + upward-arc bonus), store
its CDF; a roll's rarity = `1 / (1 − CDF(F))`. Correct under correlation. Keep the marginal
formula only as a cheap "naïve rarity" placeholder.

### 4.6 Career roll (deferred / Full Life mode)
Country/culture match is **structural**: the economy picks the menu, not stereotypes.
```
1. educationTier ~ f(z_IQ, parentRank, country.secondaryEnrollment, sex)
                   // higher IQ + richer family + higher enrollment -> higher tier
2. eligible = careers where minEducation <= educationTier AND regions matches country
3. base(c) = formal      -> sectorShare(country, c.sector)   // empAg/empIndustry/empServices
             informal     -> country.vulnEmployment          // vulnerable-employment share
             homemaker     -> (1 - country.femaleLFP), women  // ~0 for men
             unemployed    -> country.unemployment
   weight(c) = base(c)
             * c.prevalence                                   // how common, given eligibility
             * genderTilt(sex, country.femaleLFP)             // paid work only
             * skillDemand(c, z_IQ)                           // jobs only, not not-in-work
             * overQualPenalty(c, tier)                       // FORMAL jobs only
             * (1 + traitTilts(c, z_looks, z_height, z_IQ))
4. pick one career ∝ weight
5. incomeBand -> contributes to destination wealth (REPLACES the direct §4.3 trait terms;
   route the premium once, through career)
```
Data shape per career (`data/careers.json`): `{id, title, emoji, sector, minEducation,
iqTilt, looksTilt, heightTilt, incomeBand, prestige, prevalence, cohort?, regions}`.
`regions` defaults to `["*"]` (universal); use continents / culture-cluster ids only for
genuinely geographic jobs. **`prevalence`** (number) drives selection frequency — the
single biggest realism lever (a Retail Clerk is ~10× a Doctor at equal eligibility).
**`prestige`** (common→legendary) is now a PURE collectible label — it no longer throttles
selection (that was conflating two jobs). **`cohort`** (`informal`/`homemaker`/`unemployed`,
omitted = formal) swaps the sector-share base for a country-attribute base, so the informal
economy and not-in-work states scale with real labor data. Catalog is regenerable via
`sim/gen-careers.mjs` (readable source for the prevalence tuning).

---

## 5. Validation (`node sim/simulate.mjs`)

The harness now drives the **shared model** (`src/model/roll.js`) — it validates what ships,
not a separate inline copy. Three groups:

- **Structural (hard targets):** copula corr(height, looks) M/F = 0.20 / 0.10 ±0.03.
- **Career-anchored invariants (PASS/FAIL):** mean class rises monotonically across income
  bands; **no low/lowmid/mid career ever reaches the elite class** (0 leaks); heavy
  over-qualification < 3% of adults; mean childRank ≈ 0.5.
- **Emergent correlations (reported):** latest at N=200k — corr(IQ, wealth) ≈ 0.35,
  corr(education, wealth) ≈ 0.64, corr(parent, child wealth) ≈ 0.60, corr(IQ, lifespan) ≈ 0.14.

Directional sanity (mean adult wealth rank): rich+highIQ 0.83 > rich+lowIQ 0.53 >
poor+highIQ 0.36 > poor+lowIQ 0.18 — monotonic in both origin and merit, with neither
dominating. (NOTE: the old trait-term targets — corr(IQ/looks/height, income), rank-rank =
β, dispersion — predate the career-anchored refactor and no longer apply.)

---

## 6. Decisions

Resolved:
1. **Tech stack** — Vite + React + TypeScript. ✅
2. **v1 scope** — client-only, no backend; spins + Lives in localStorage; deployed to
   GitHub Pages (auto-deploy on push to main). ✅
3. **Career in v1** — included (education → occupation, structural country weighting). ✅

Still open:
4. **IQ data** — the per-country IQ estimates are the shakiest, most contentious input;
   decide keep / replace / drop. It does NOT propagate deterministically (luck dominant).
5. **Project name** — `spin-life` working name; rename freely.
6. **Rarity** — still the marginal-product `1/√(∏ pᵢ)` placeholder; the joint/empirical
   version (§4.5) is the planned upgrade.
7. **Deferred Full-Life features** — marriage, kids, happiness, health, migration, etc.

Career weighting uses the World Bank employment/enrollment columns — **fetched and
merged into `countries.json`** (empAg/empIndustry/empServices, femaleLFP, secondaryEnrollment),
plus the labor pair `vulnEmployment` (SL.EMP.VULN.ZS) and `unemployment` (SL.UEM.TOTL.ZS),
filled for 186/241 countries — the rest fall back to defaults. The informal-economy and
not-in-work cohorts ride on these: South Africa surfaces "Unemployed", Saudi Arabia
"Homemaker" #1, Niger the informal survival economy — all emergent from the real data.

## 7. Data provenance (credit honestly)

World Bank (population, life expectancy, Gini, employment/enrollment, vulnerable-employment
& unemployment via ILO-modeled estimates), UBS Global Wealth Databook (net worth),
NCD-RisC (height), per-country IQ estimates (IQ — with the caveat above), UNESCO
(enrollment). Looks is synthetic. The career *catalog* itself is hand-authored (the
taxonomy); the country *matching* is data-driven (employment shares + the labor pair).
