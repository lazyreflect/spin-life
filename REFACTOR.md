# REFACTOR.md — model logic refactoring design

Consolidates the architecture review of `src/model/` and `data/`. The goal is not
to change model *behavior* but to fix where things are *defined*, so the model
becomes "descriptors as data, engines as code" and future edits are one-place,
fail-loud, and sim-gated.

Scope: `events.js`, `careers.json`, `content.js`, `roll.js`, `countries.json`,
`model-params.json`, and the missing layers between them.

---

## 1. The unifying diagnosis

Every problem in these files is the same problem in different clothes: **a core
domain concept is defined in multiple places, and the data/code boundary is drawn
in the wrong spot.** The model has four real taxonomies — *income bands,
education tiers, occupational class, career tags* — plus an *event catalog* and a
*country dataset*, and not one of them has a single home. Code re-derives
relationships inline (band→skill, band→rank, id→"is dangerous", missing→default)
instead of reading them off a descriptor.

The single worst example: "income band" — six ordered tiers — is defined **six
times** across three files.

| Where | What it encodes |
|---|---|
| `BAND_SKILL` (content.js:57) | band → skill level |
| `CAREER_RANK` (roll.js:19) | band → central wealth rank |
| `CAREER_RANGE` (roll.js:27) | band → [floor, ceiling] |
| `LOW_BAND`/`MID_UP`/`RICH_BAND`/`SUB_TOP` (events.js:21–24) | band → membership sets |
| `BANDS` (simulate.mjs:21) | the ordering |
| `precarity` cCareer ladder (events.js:57–59) | band → precarity |

Add a seventh band and you edit six places or get silent gaps.

**The cure, one sentence:** one concept, one definition; data *describes*, code
*computes*. Data if it's a value/row a non-programmer would tune or the sim
calibrates; code if it's a relationship or algorithm.

---

## 2. Target layout

```
data/
  bands.json        ← NEW  6 income-band descriptors (skill, rank, range, precarity)
  education.json    ← NEW  the edu ladder (or fold into model-params.json)
  careers.json      ←      + occRank, + tags  (single source of truth per career)
  events.json       ← NEW  catalog rows: gates + prob/severity shape refs + flags
  copy.json         ← NEW  text pools keyed by event id / tag (variants, disaster, fall-arc)
  countries.json    ←      cleaned; drop dead _est cols; canonical schema
  imputation.json   ← NEW  ONE default/estimate policy per nullable country field
  model-params.json ←      absorbs every remaining scattered scalar (RATE, blends, ^1.4…)
src/model/
  load.js           ← NEW  normalize + impute + validate boundary (disk → model)
  taxonomy.js       ← NEW  loads bands/education; exposes lookups + predicates
  select.js         ←      rollEducation, rollCareer (affinity score)
  wealth.js         ←      income + asset floor + childRank (+ heir drawdown)
  events.js         ←      resolver + shape/fn registry (NO catalog data)
  class.js          ←      occRankOf (validated), classOf, standing()
  rarity.js         ←      empirical fortune CDF
  narrate.js        ←      buildSentence, tag→copy
  format.js         ←      money, heightImperial
  names.js          ←      pickName, CONTINENT_REP (→ folded into load.js imputation)
```

---

## 3. Schemas

### 3.1 `bands.json` (highest-leverage extraction)

Collapses five of the six band definitions in §1 into one ordered table.
`centralRank`/`range` are **calibration outputs** — sim-validated, not hand-edited.

```jsonc
[
  { "id":"low",    "order":0, "skill":1.0, "centralRank":0.20, "range":[0.00,0.40], "precarity":0.45 },
  { "id":"lowmid", "order":1, "skill":1.5, "centralRank":0.33, "range":[0.06,0.55], "precarity":0.45 },
  { "id":"mid",    "order":2, "skill":2.0, "centralRank":0.48, "range":[0.20,0.66], "precarity":0.20 },
  { "id":"highmid","order":3, "skill":3.5, "centralRank":0.64, "range":[0.40,0.82], "precarity":0.08 },
  { "id":"high",   "order":4, "skill":4.0, "centralRank":0.80, "range":[0.58,0.96], "precarity":0.08 },
  { "id":"elite",  "order":5, "skill":5.0, "centralRank":0.93, "range":[0.72,1.00], "precarity":0.08 }
]
```

`LOW_BAND`/`MID_UP`/`RICH_BAND` become derived predicates (`band.order <= 1`), not
hand-maintained Sets.

### 3.2 `careers.json` — single source of truth per career

Two facts that belong to a career currently live elsewhere; move them on:

1. **`occRank`** — emit from `gen-careers.mjs`; delete the `OCC_RANK` map
   (content.js:137). (Verified: `occRank` appears 0× in careers.json today; the
   `?? 0.40` fallback masks the drift.)
2. **`tags: []`** — replace the seven id-Sets in events.js (`DANGEROUS`,
   `COMPANY_TOWN`, `AUTOMATABLE`, `PERFORMER`, `TRADER`, `STATUS`, `VULN_COHORT`),
   which are inverted indexes of career properties.

```jsonc
{
  "id": "welder", "title": "Welder", "sector": "industry",
  "minEducation": "vocational", "incomeBand": "mid",
  "iqTilt": 0.0, "looksTilt": 0, "heightTilt": 0,
  "occRank": 0.40,                              // ← was OCC_RANK[id]
  "tags": ["dangerous", "company-town", "automatable"]   // ← was the 7 Sets
}
```

After this, **everything true about a career is on the career**; adding a career
is a one-place edit, validated on load.

### 3.3 `events.json` + `copy.json` — declarative catalog

Today the `EVENTS` array is data trapped in code (prob/severity/text are
closures), and "this event can vary its phrasing" is expressed three
inconsistent ways. **Verified:** of 42 events, **40 are frozen single strings**,
1 is an inline-array function (`keptfromschool`), 1 is a keyed-pool function
(`disaster`) — and the five `FALL_*` arrays live *outside* the table entirely.
Whether an event can vary is an accident of how it was typed.

Unify: **every event's text is always a pool** (single phrasing = 1-element
pool); the resolver always picks uniformly. `disasterText` (keyed by continent)
and `FALL_*` (keyed by fall-severity) are the same primitive — a *tagged* pool.

```jsonc
// events.json — a row is pure data, no closures
{
  "id": "closure",
  "category": "work",
  "gates":        { "career": { "tags": ["company-town"], "formal": true } },
  "prob":         { "shape": "inst-linear", "base": 0.05, "k": 0.8 },
  "severity":     { "shape": "const", "w": -0.14 },
  "age": 0, "fatalP": 0,
  "flags":        ["decline", "precaritySensitive"],
  "interactions": { "requires": [], "excludes": [] }
}
```

```jsonc
// copy.json — pools keyed by event id, or by a selector key
{
  "illness": ["battled a serious illness",
              "spent years fighting a grave illness",
              "was never the same after a long sickness"],
  "disaster": { "byContinent": { "Asia": ["lost everything to a flood", "…"], "Africa": ["…"] } },
  "arc-fall": { "byTag": { "kept": ["lived off the family money", "…"],
                           "drawn": ["ran through the family money", "…"],
                           "deep":  ["never recovered…", "…"] } }
}
```

**Probability/severity shapes** — ~90% of events fit ~6 named shapes, defined once
in a registry in `events.js`:

| shape | example today | params |
|---|---|---|
| `const` | `w: -0.14` | `{w}` |
| `inst-linear` | `0.06*(1+1.4*i)` | `{base, k}` |
| `inst-quad` | `0.12*i*i` | `{base}` |
| `trait-power` | `0.05*parentRank^1.5` | `{base, trait, pow}` |
| `gini-gated` | `…clamp((gini-40)/45)` | `{base, lo, hi}` |
| `heavy-tail` | `-mag(0.05,0.40,r,2.6)` | `{lo, hi, p}` |

**Escape hatch, deliberately:** the genuinely bespoke curves (`scholarship`,
`business`) reference a **named function by key** (`"prob": {"fn":"scholarship"}`),
NOT a JSON expression language. Data for the common case, a named code hook for
the rare one. Do not reinvent JavaScript in JSON.

`events.js` then shrinks to: shape registry + fn registry + the resolver pipeline.
The 42-row catalog leaves the code entirely.

### 3.4 The gate object + generic evaluator

`passesGates` (events.js:226) is a bespoke if-ladder over 10 keys. Four of them
(`ids`, `sector`, `cohortIn`, `formalOnly`) are all "gate on a career property"
spelled four ways; `region`/`minInst` are both "gate on the country." Collapse to
a declarative object grouped by entity, walked by one generic evaluator:

```jsonc
"gates": {
  "sex": "Female",
  "career":  { "tags": ["dangerous"], "bands": ["high","elite"], "formal": true },
  "country": { "minInst": 0.45, "regions": ["Africa"] }
}
```

Adding a gate dimension becomes a data key + one evaluator clause, not a new `if`
per event property (Open/Closed).

**Separate the smuggled second layer.** `requires`/`excludes` are NOT eligibility
gates — they are relationships *between events*, resolved *after* firing
(events.js:266, 276). Move them to `interactions` (§3.3). Two concepts, two homes.

### 3.5 `imputation.json` — one missing-data policy

Today ~20 scattered `?? default` literals ARE the data-cleaning layer, smeared
through the model math — and they **contradict each other**. Verified:

- `secondaryEnrollment` → imputed **70** (content.js:28, scholarship) vs **100**
  (events.js:176). Same field, two assumptions.
- `femaleLFP` → **55** (content.js:49) vs **60** (events.js:177).

One table, one default (or derived estimate) per nullable field, used everywhere:

```jsonc
{
  "secondaryEnrollment": 70,
  "femaleLFP": 55,
  "vulnEmployment": { "estimate": "0.15 + 0.85*instability" },  // see precarity() fallback
  "unemployment": 6,
  "netWorth": 25000
}
```

(Coverage today: `vulnEmployment`/`unemployment` missing in 55 countries, `isco`
in 83.) After load, **the model sees only complete data — zero `??` in the math.**

---

## 4. The cross-cutting boundary: `load.js` (normalize + validate)

Gates, the country `??`s, the dead `_est` columns, the `CONTINENT_REP` name
fallback, and the `?? 0.40` occRank drift are all the same missing thing: **there
is no layer between raw JSON on disk and the data the model computes on**, so
every consumer re-implements cleaning, inconsistently.

`load.js` runs once at `makeRoller` time and does three jobs:

1. **Impute once**, from `imputation.json`. Every nullable field gets exactly one
   default. Removes ~20 magic `??`; fixes the 70-vs-100 contradiction.
2. **Validate and fail loud.** Assert at startup:
   - career ids unique;
   - every event-gate `tag`/`band` resolves to a real career property;
   - every `interactions.requires` target is a real event id;
   - every `isco` group referenced exists;
   - required country columns are present-or-imputed.
   A typo becomes a startup error, not a silently-never-firing event.
3. **Stamp provenance.** Mark imputed values (`_imputed: ["vulnEmployment"]`) so
   the sim or a card can know an outcome leaned on a guess. (This is what the
   orphaned `_est` convention — present on ~⅓ of rows, **read by no code** — was
   reaching for. Delete `_est`; replace with real provenance.)

The model then becomes pure: given complete, validated data, compute.

---

## 5. content.js split (Single Responsibility)

content.js currently does five unrelated jobs. Split:

| New module | Takes from content.js |
|---|---|
| `names.js`   | `pickName`, `CONTINENT_REP` (fallback → load.js) |
| `select.js`  | `rollEducation`, `rollCareer` |
| `class.js`   | `occRankOf` (validated lookup), `classOf`, `RULING`, `standing()` |
| `format.js`  | `money`, `heightImperial`, `rarityText` |
| `narrate.js` | `buildSentence` + tag→copy |

The triplicated `0.60*occ + 0.40*rank` standing blend (content.js:170, roll.js:123,
roll.js:189) becomes one `standing(occ, rank)` in `class.js`.

---

## 6. Principle-violation table (the why, with evidence)

| Principle | Evidence |
|---|---|
| **Single source of truth (DRY)** | income band ×6; edu ladder ×3; `0.60/0.40` blend ×3; occRank parallel to careers.json |
| **SSoT for *policy*, not just values** | `secondaryEnrollment` imputed 70 vs 100; `femaleLFP` 55 vs 60 — the *decision* is duplicated and contradictory |
| **Open/Closed** | can't add an event, career, or gate dimension without editing code |
| **Single Responsibility** | content.js (5 jobs); `rollEvents` (eligibility + scoring + selection + forced-arc + lifespan) |
| **Locality of Behavior** | "is this career dangerous?" stored in events.js; an event's phrasings in 3 places |
| **Separation of data & logic** | the `EVENTS` table is data trapped in closures; catalog fused to engine |
| **Least Astonishment / consistency** | `text` is string\|fn; `prob` is `()=>k`\|`(x,i)=>…`; flag names are a grab-bag (`child`, `decline`, `formalOnly`, `precaritySensitive`, `exemptHeadroom`) |
| **Primitive obsession / stringly-typed** | bands/cohorts/sectors/ids as bare strings; the 7 Sets are a denormalized index with **no sync** (valid today, unenforced) |
| **Fail loud, not silent** | every `??` and `?? 0.40` swallows missing data with a guess and no signal |
| **Validation / schema-on-read** | no data file is validated; careers `_schema` is a comment; non-uniform `_est` rows slipped in |
| **Magic numbers** | `RATE=0.42`, `^1.4`, the blends, `IQ_COMPRESS`, every prob coefficient |
| **Temporal / implicit coupling** | `rollEvents` stage order; `forcedArc` reads mid-pipeline state; `RATE` couples every event prob to the aggregate |
| **Feature envy** | events.js constantly reaches into `career.incomeBand/.cohort/.id/.sector` |
| **Dead code / YAGNI** | `_est` columns on ~⅓ of rows with zero consumers |

---

## 7. Prerequisite 0 — make the harness enforce

The whole "each step is sim-gated so a fix can't silently reopen a regression"
guarantee is currently **vapor**: `simulate.mjs` prints `PASS`/`FAIL` strings but
**never exits non-zero**, and CI (`.github/workflows/deploy.yml`) runs only
`npm run build`, not `npm run sim`. Before any migration step:

1. `simulate.mjs` → `process.exit(1)` on any FAIL.
2. Wire `npm run sim` into CI as a required check.
3. Add the assertions each step below depends on (noted inline).

Without this, the sequencing's safety net doesn't exist.

---

## 8. Migration sequence (each step independently shippable + sim-gated)

| # | Step | Why here | New assertion to add first | Risk |
|---|---|---|---|---|
| 0 | Harness exits non-zero + in CI | the gate everything else relies on | — | very low |
| 1 | `load.js` boundary + `imputation.json`; delete `_est`; centralize all `??` | pure plumbing, fixes the 70-vs-100 contradiction, zero behavior change if defaults match current | startup validation passes; population stats unchanged within tol | low |
| 2 | Move scattered scalars (`RATE`, blends, `^1.4`, `TRAIT_INCOME`) → `model-params.json` | plumbing; makes everything tunable | stats unchanged within tol | very low |
| 3 | `careers.json` += `occRank` + `tags`; delete `OCC_RANK` map + 7 Sets; `occRankOf` validates (no `?? 0.40`) | unblocks gate + class refactors | every tag/id resolves; occ-rank distribution unchanged | low |
| 4 | Extract `bands.json` + `taxonomy.js`; replace the 6 band definitions | kills the dominant DRY violation | band central-ranks regenerated by sim; monotone-band invariant holds | medium |
| 5 | `events.json` + `copy.json` + shape/fn registry; gates → declarative object + generic evaluator; `requires/excludes` → `interactions` | the big catalog-as-data move | event-rate ≈ unchanged; steep-drops-carry-a-story ≥98%; every event text is a pool | medium |
| 6 | Split `content.js` (§5); single `standing()` | isolated, mechanical | stats unchanged within tol | low |
| 7 | Empirical fortune-CDF rarity (`rarity.js`); delete the marginal floors + `1/sqrt` fudge | self-contained, high payoff | rarity distribution sane; no lone-stat blowups | low |
| 8 | Affinity-score `rollCareer` (single soft-max); delete stacked correctives + carve-outs | highest value, most-coupled fn | **occupation-share fidelity vs ISCO** (NEW — guards the latest commit); over-qual <3%; selection monotone in IQ↔skill | medium-high |
| 9 | Relative-percentile class (`classOf`) | shifts mobility distribution; land when harness is otherwise stable | mean mobility ≈ 0; elite-leak = 0 | medium |

**Resist:** doing steps 4–8 as one big rewrite. That trades many small regressions
for one giant un-reviewable one. Land in order, verify each against `npm run sim`.

---

## 9. Things to deliberately NOT do

- **Don't datafy bespoke probability curves into a JSON expression language.** Named
  function hooks (`{"fn":"scholarship"}`) for the long tail; the inner-platform
  anti-pattern is worse than the closures.
- **Don't merge `occRank` into `incomeBand`.** Correlated but distinct axes (a
  journalist vs an accountant). Co-locate both on the career; don't collapse.
- **Don't let `bands.json` drift from calibration.** `centralRank`/`range` are sim
  *outputs*; the sim must regenerate/validate them, not a human hand-editing.
- **Don't validate at runtime in the hot path.** `occRankOf` etc. validate once at
  `makeRoller`/`load.js` time, then do cheap lookups (`rollLife` runs N times).

---

## Appendix — file/line index of the named smells

- Stacked correctives: `rollCareer` content.js:84–101
- Forced-arc threshold cascade: `forcedArcEvent` events.js:204–223
- Rarity floors + sqrt fudge: roll.js:171–180
- Silent occRank default: content.js:164
- The 7 id-Sets: events.js:25–37
- Frozen single-string events: 40 of 42 in `EVENTS` events.js:95–183
- `FALL_*` pools outside the table: events.js:191–195
- Gate if-ladder: `passesGates` events.js:226
- Contradictory imputation: content.js:28/49 vs events.js:176/177
- Dead `_est` columns: countries.json (read by no code in `src/`)
- Triplicated standing blend: content.js:170, roll.js:123, roll.js:189
