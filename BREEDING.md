# Breeding & Trading — Exploration

> **STATUS: EXPLORATORY. NOTHING LOCKED.** This doc is a thinking space, not a
> spec. None of the mechanics, numbers, or structures below are decided — they
> are options and their consequences, captured so the design conversation has a
> written record. The one idea flagged as *most promising* (information
> asymmetry, §2.2) is still just promising, not chosen. Contrast with DESIGN.md,
> whose core *is* locked/calibrated; this is the opposite — a menu.

Working idea: cards (generated lives) can be **traded**, and a **male + female
card can produce a family** of child cards. This doc covers how a market might
work, how breeding might work, what players would seek in a "partner," and —
most importantly — **the concrete ways the current codebase resists all of
this** (§6, the readiness issues), with file references. **§9 covers the voice
and theme** — the one place this doc lands a firm recommendation, because the
wording carries real risk next to a heritable-IQ mechanic. (Note: §3 still uses
the blunt term "breeding" for the *mechanic*; per §9 the player-facing *voice*
should be the family register, not livestock.)

---

## 1. Why this even fits — two existing hooks

Breeding is not a bolt-on; the model is already half-built for it:

1. **Two-stage wealth already models parent → child.** `parentRank → mobility
   equation → childRank` (`src/model/roll.js:115-139`). Breeding just replaces
   "draw the parents randomly" with "the parents are two real player-owned
   cards." The wealth half of breeding is mostly plumbing.
2. **The copula already draws correlated heritable latents.** `z = [zFamWealth,
   zIq, zHeight, zLooks]` via `corrNormals(L[sex])` (`roll.js:112`). Breeding
   replaces "draw `z` from N(0,1)" with "draw `z` from the two parents' `z`."

So breeding *is* the generational loop the model implies. The trait/copula half,
the verdict recalibration, and the events.js reconciliation are the real work
(§6).

---

## 2. Trading market (exploration)

### 2.1 What gives a card value
- **Realized rarity** — the card's own fortune-score percentile / arc / rare
  career. What a *collector* pays for. (`life.rarity`, `life.luckPct`,
  `src/model/score.js`.)
- **Breeding value (latent `z`)** — what it passes on. A card can live a
  mediocre life (regression to the mean hid its genes) yet carry elite latent
  `zIq`/`zHeight`. What a *breeder* pays for.

### 2.2 Information asymmetry  ⭐ (the most interesting lever — still just a candidate)
Phenotype (the life it lived) vs genotype (the `z` it passes on) — the
racehorse/livestock distinction.
- Reveal **displayed stats** fully; keep **latent `z` partially hidden**.
- Show a noisy "potential" band that **tightens as the card produces
  offspring** (each child is a data point about the parent's true `z`).
- Result: pedigree, scouting, speculation, "proven studs/dams." A card with
  proven elite kids commands a premium even if its own life was average.
- If you reveal full `z`, the market is efficient and boring; the *hidden*
  information is the whole game. NOTE: the model already stores `zIq/zHeight/
  zLooks` on each life (`roll.js:182`) — the genotype literally exists; the
  design choice is how much of it to expose.

### 2.3 Supply control (or the market dies of inflation)
- **Founders are scarce** — only *spins* mint Generation-0 cards; breeding mints
  G1+. Rare-country / rare-arc G0 cards are the bedrock (a foundation sire).
- **Limited fertility** — finite offspring per card. Candidate: tie it to the
  model's existing `age`/lifespan (`roll.js:161-166`) — a fertile window, so
  short-lived cards are naturally scarcer breeders and lifespan becomes a
  *traded* attribute.
- **Sinks** — a breeding cost; dead cards stop breeding; decide whether dead
  cards still trade as **pedigree collectibles** (leaning yes — keeps lineage
  valuable, gives death weight).
- **Generation tax** — later generations regress harder / cost more, so you
  can't infinitely compound an elite line without fresh G0 blood (pushes demand
  back to spins).

### 2.4 Architecture fork (decide before any mechanic)
Current app is **client-only, localStorage, no backend** (`src/App.tsx:11-24`).
A credible *trade* market needs server-side authority (ownership, anti-dupe,
scarcity) — you can't trade state that lives in each player's localStorage.
Options:
- **Backend** (accounts + authoritative DB) — most control over supply/sinks.
- **On-chain / NFT** — provenance + market for free (this is literally the
  CryptoKitties lineage), but commits to wallets/gas and a different audience.
- **Closed economy first** — ship *breeding* single-player (no real trade, maybe
  gifting/showcase), prove the loop is fun, add a market only once it earns one.
- **Leaning: build breeding closed/single-player first.** Trading is the
  expensive, risky part; breeding is the fun part and doesn't need a market to
  be enjoyable.

---

## 3. Breeding mechanics (exploration)

Concrete algorithm, tied to existing code. **Candidate, not decided.**

**Step 1 — Heritable traits (copula, but mid-parent).** Replace the i.i.d. draw
`z = corrNormals(L[sex])` with mid-parent regression + Mendelian noise:
```
z_child[trait] = h[trait] · ½(z_father[trait] + z_mother[trait])
               + sqrt(1 − h²·½) · noise          // noise drawn THROUGH chol(R)
```
`h` ≈ heritability: height ~0.8, IQ ~0.5, looks ~0.3–0.4. Then run the existing
§4.2 marginal mapping unchanged → marginals preserved.
- **Free side effect: regression to the mean.** Two elite parents usually
  produce a good-but-lesser kid, occasionally (noise tail) a super-kid. That tail
  is the jackpot / chase loop.
- **Critical:** the noise MUST go through `chol(R)` or breeding silently
  destroys the calibrated `corr(height,looks)=0.20/0.10` that `sim/simulate.mjs`
  asserts as a HARD target (see §6-D).

**Step 2 — Family wealth (already exists).** The parents' **adult** wealth
(`childRank`) becomes the child's **origin** (`parentRank`), then run the §4.3
mobility equation. The breeding loop and the generational-mobility loop are the
same loop. `β<1` + luck-dominant noise means dynasties are possible but erode
without merit — a great story engine.

**Step 3 — Country / heritage.**
- Same-country parents → that country's marginals (clean).
- **Cross-country parents → currently undefined** (see §6-C). The interesting
  case (rare mixed-heritage kids, migration unlock) is also the hardest — the
  whole model is conditioned on one country row.

**Step 4 — Sex, litters, the "family."** Child sex 50/50. A "family" = a *litter*
of N children, each an independent noise draw → a spread of kids, most ordinary,
occasionally a standout. The **family card** itself can be a collectible
(dynasty net worth, best-child highlight, multi-generation class arc).

**Step 5 — New collectible axes** (feed the chase/Passport loops): dynasty rarity
(N generations of sustained elite — rare *because* of regression), pedigree/
lineage cards, mixed-heritage rarity, tail super-kid (beats both parents' CDF).

---

## 4. What players seek in a "partner" (demand side)

Variety here is what keeps a market liquid — different buyers want different
things, so no single "meta" partner dominates:

1. **Trait stacking** — two tall, high-IQ parents → push a kid into the joint
   tail (probabilistic; regression fights you → a chase, not a purchase).
2. **Wealth / dynasty building** — a rich partner raises the kid's `parentRank`
   and (via §4.3) the odds of a high-status life.
3. **Heritage / country collecting** — a specific/rare nationality for mixed
   kids, Passport completion, migration arcs. Pure collector demand.
4. **Rarity speculation** — pair two high-fortune cards hoping for a flippable
   super-kid.
5. **Complementarity / threshold-filling** — "elite IQ but short, need a tall
   partner to clear both thresholds" → keeps *mid-tier* cards tradable.
6. **Proven studs/dams** — track record of strong offspring (the §2.2 revealed
   `z`). Pedigree premium.
7. **Scarce-sex demand** — if one sex is rarer for a high-value combo, it's
   sought regardless of its own life.

**Healthy-market signal:** no single optimal partner, because regression caps
trait-stacking, mobility erodes wealth dynasties, and collecting demand is
orthogonal to stat-maxing. This is the master dial ("small coefficients, loud
fat-tailed luck") applied to the economy — it stops a pay-to-win spiral.

---

## 5. Economy risks
- **Inflation** → founder scarcity + fertility caps + sinks (§2.3).
- **Meta homogenization** → regression + luck-dominance already fight it;
  reinforce with diminishing returns on repeat/inbred pairings.
- **Pay-to-win** → keep luck dominant so money buys *more attempts*, not
  *guaranteed outcomes* (gacha math, not purchase math).
- **Anti-fraud** → the §2.4 backend/chain decision; never ship a market on
  localStorage.
- **Compounding selection saturating the tiers** → see §6-G.

---

## 6. Readiness issues — how the current code resists breeding

The model draws *one random individual from a global population*. Almost every
calibration, dedup, and content assumption breaks when you compose a child from
two specific parents. Grouped, with file refs and a checklist (§7).

### A. Identity & persistence — nothing to hang a family tree on
- **No stable ID / no parent pointers.** Identity is `lifeKey = code|name|age|
  netWorth|luckPct` (`App.tsx:15`), a *content* hash. Lineage needs `id` +
  `parentIds`.
- **That key collides exactly where breeding concentrates cards.** Bred siblings
  share `code` + name cluster (`content.js:11`) + similar age/netWorth/luckPct →
  `lifeKey` collision → `keep()` silently drops one (`App.tsx:26-31`). Same root
  cause hits `copySig` (`copy.js:83`) → two children, identical copy.
- **Collection is capped + FIFO-truncated.** `MAX_KEPT=200`, `.slice(0,200)`
  (`App.tsx:9,29`) — a growing tree silently loses its oldest = its founders.
- **localStorage only, no backend** (`App.tsx:11-24`) — even single-player
  breeding needs durable lineage storage.
- **Genotype only partially stored.** `roll.js:182` saves `zIq,zHeight,zLooks`
  but **drops `zFw`** (the wealth latent `z[0]`). Store all four.

### B. The model is population-calibrated, not pair-composable (deepest issue)
- **Global calibration baked at construction** from 30k *random* draws (`mu, sd,
  jumpSd, occSorted`, `roll.js:77-101`); verdict reads a **CDF over the random-
  birth population** (`luckCdf.json`, `score.js`). Bred kids are NOT samples from
  that population → `rarity`, `luckPct`, and the headline **"Luckier than X% of
  all births"** are systematically wrong for any card past G0.
- **`jumpSd` (arc rarity) assumes uniform parent-rank origin** (`roll.js:99,213`)
  — bred `parentRank` = parents' `childRank`, not uniform.
- **The "parent" is a fresh scalar + a *synthetic* occupation** (`parentRank`,
  `parentOccOf`, `originStanding`, `roll.js:103,115,132-133`). For a bred child
  you KNOW the real parents (`career.occRank`, `childRank`); the synthetic-parent
  machinery becomes wrong/redundant → structural change to `rollLife`.

### C. Country & sex drawn fresh; cross-country undefined
- `country`/`sex` sampled per roll (`roll.js:110-111`); everything downstream is
  conditioned on country × sex — copula `L[sex]`, height/IQ means,
  `wealthQuantile(country.…)`, the whole career engine (`content.js:42-108`:
  empAg/Industry/Services, femaleLFP, vulnEmployment, unemployment, isco, names).
- Same-country pairing: workable. **Cross-country pairing: undefined** — no
  blended country row; you'd synthesize ~15 columns or pick one + tag ancestry.
  Biggest modeling gap; could be deferred by restricting v1 to same-country.

### D. Copula / heritability rewrite is subtle (silently breaks the sim invariant)
- Replacing `corrNormals(L[sex])` (`roll.js:112`) with midparent+noise:
  1. **Route residual noise through `chol(R)`** or you destroy
     `corr(height,looks)=0.20/0.10` — a HARD PASS/FAIL in `sim/simulate.mjs`
     (DESIGN §5). Holds for G0; G1+ violates it unless built right.
  2. **`R` is sex-specific** (`model-params.json` male≠female) — which matrix
     governs a child's residual? Undecided.
  3. **`z` is country-mean-relative** — averaging parents from different
     countries mixes reference frames. Clean same-country; ambiguous cross.
- **Display clamps hide genotype at the tails** — IQ compressed+clamped 60–160
  (`distributions.js:9`, `roll.js:117`), height/looks clamped (`roll.js:118-119`).
  Breed on stored `z`, never displayed values.

### E. events.js already simulates a *shadow family* that will contradict the real one
No partner/child system exists, yet events narrate one with real effects:
- `married` "married into wealth" `+0.22` (`events.js:144`); `widowed` (`:121`);
  `divorce` (`:122`); `lostchild` (`:123`); `maternal` "died in childbirth",
  Female, **`fatalP:0.85`** (`events.js:108`).
- Collisions once families are concrete: a card rolls **"married into wealth"**
  while paired with a poor partner card (contradiction); a card you use as a
  4-family **mother died at 19 in childbirth** in her own story; widowed/lostchild
  assert family the breeding system now owns.
- DESIGN §3 lists "marriage/partner" as *deferred* → these events are a
  placeholder shadow-family. Breeding must gate/suppress them when real partner/
  children exist, or convert them into breeding outcomes. **Not optional.**

### F. A card is a finished, dead life — not a breedable individual
- Cards are generated complete: an `age` at death, already deceased; some
  `diedYoung` "died at 7" (`roll.js:164-166`). No current age, no fertility
  window. **Nothing stops selecting a died-at-7 or childbirth-death card as a
  parent.** Reframing "card = a life story" → "card = an individual with a
  fertile window" is foundational, plus new gating.
- Phenotype/genotype diverge (a high-IQ heir who fell to working class via
  `forcedArcEvent` has low `childRank` but elite `z`) — exactly the §2.2 market
  axis, but the model surfaces only phenotype today.

### G. Compounding selection saturates the tiers
- Positive events scale with traits (`business, bigbreak, promotion, fame,
  sports, scholarship, emigrate`, `events.js:141-154`). Breed high-`z` →
  high-`z` kids → more good events → higher `childRank` → next gen's
  `parentRank`. The "luck dominates" safety (`luckSd=0.10`, headroom
  `roll.js:289`) is tuned for one-shot births, not iterated selection. With the
  miscalibrated CDF (§B) the top tiers pin and the verdict headline collapses.

### H. Determinism / sharing doesn't extend to lineage
- `rollLife(seed)` reproduces a life from one seed (`roll.js:108`). A child is a
  function of two parent cards + a breed RNG, not one seed. Permalinks (one seed
  → one life) don't generalize; persist the full child or a `(parentA_id,
  parentB_id, breedSeed)` tuple — which needs the parent IDs that don't exist
  (§A).

---

## 7. Priority order (a checklist, not a commitment)

- [ ] **1. Identity layer** (§A) — stable `id` + `parentIds`; store all four `z`
      incl. `zFw`; fix `lifeKey`/`copySig` collisions; remove/replace the
      200-cap. *Prerequisite for everything.*
- [ ] **2. Recalibrate the verdict** (§B, §G) — don't apply the population CDF /
      `mu,sd,jumpSd` verbatim to bred cards; separate scale or regenerated/
      segmented CDF; add anti-compounding damping.
- [ ] **3. Reconcile events.js** (§E) — gate `married/widowed/divorce/lostchild/
      maternal` against real partner/children state.
- [ ] **4. Breeding draw** (§D) — midparent + noise-through-`chol(R)`; decide
      sex-matrix & cross-country `z` semantics; keep `corr(height,looks)` green
      for G1+.
- [ ] **5. Cross-country country-record synthesis** (§C) — hardest call; defer by
      restricting v1 breeding to same-country pairs.
- [ ] **6. Reframe card as fertile individual + gating** (§F) — block dead-young/
      childbirth-death/sex-invalid parents.

The wealth half (`parentRank → mobility → childRank`) is mostly plumbing because
it already exists; the trait/copula half, the verdict recalibration, and the
events.js reconciliation are the real work.

---

## 8. Open questions (none answered yet)
- Closed-economy-first vs market-up-front (§2.4)?
- How much genotype to reveal (§2.2) — full, none, or proof-tightening band?
- Same-country-only v1, or solve cross-country heritage now (§C)?
- Fertility model: lifespan-window vs fixed foal-cap vs escalating cooldown (§2.3)?
- Do dead cards remain tradable as pedigree (§2.3)?
- Separate "bred" verdict scale, or fold bred cards into one recalibrated CDF (§B)?

---

## 9. Terminology & theme  (the one firm recommendation)

Unlike the rest of this doc (a menu), this is a recommendation — because the
wording is *risk*, not taste. The mechanic tracks heritable IQ/height/looks (and
DESIGN.md already flags per-country IQ as the "shakiest, most contentious"
input). Livestock language — *breeding stock / dam / litter / bloodline* — on top
of heritable-IQ-by-country reads as a eugenics simulator, not a birth-lottery
toy. Reframing the voice is harm-reduction, not politeness.

### 9.1 Voice: plain, not warm
Adopt the family register, but resist saccharine. The game's actual voice is
deadpan and dark (it cheerfully reports death in a famine at 7). Greeting-card
warmth clashes with that *harder* than the cold language did. Aim for **plain
human language said flatly** — *mother, father, children, family* — which is
already on-brand: *"Born to two parents who never met. Four children. Died at
81; none came to the funeral."* Goal = **plain, not warm.**

Endorsed mapping (from the design discussion):

| Avoid (livestock) | Use (plain family) |
|---|---|
| breeding / to breed | starting a family / having children |
| a male + female card | two parent cards / a couple |
| stud / dam / breeding stock | parent (mother / father) |
| litter (of N) | children / a generation / siblings |
| breeding value | legacy potential / what they pass on |
| pedigree | lineage / heritage / ancestry |
| foal-cap / fertility cap | family size limit |
| inbreeding | closely-related pairings |
| partner-seeking | **partner** (already warm — keep) |

Caveat: "couple / two parents" is warm, but the genetics layer is still
sex-gated (needs M+F). Decide whether the *social* framing may decouple from the
biological one (donor/adoption) — small, but the word writes a check the model
doesn't yet cash (§6-D, §6-F).

### 9.2 Theme: three altitudes, not one word — and kill one
*Family*, *lineage*, *dynasty* are not rival names for one slot; they do three
different jobs and should stack. *Bloodline* should be cut outright.

| Word | Connotation | Job |
|---|---|---|
| **Family** | intimate, horizontal, one generation | the **voice** (moment-to-moment) |
| **Lineage** | neutral, vertical, descent, a tree | the **structure** (data model, §6-A/H) |
| **Dynasty** | aspirational, power, sustained success | the **chase** (the rare trophy) |
| **Bloodline** | blood/genetic *purity*, aristocracy | ❌ **cut** — most eugenics-coded, worst possible next to heritable IQ |

**The deeper call (on-theme dynasty):** if *dynasty* becomes a power fantasy
(accumulate → ascend → win), it fights the game's soul — the birth lottery and
the cruelty of social mobility, where most lives *don't* ascend and the irony is
the point. It's also the pay-to-win failure mode (§5). So frame dynasty as **the
thing you reach for and usually lose:** regression to the mean drags elite kids
back toward average, and a famine / currency collapse (already in events.js) can
erase three generations in one card. **A collapsing dynasty is more on-brand
than a triumphant one** — the climb is a legend precisely because it almost never
holds. That keeps breeding inside the existing dark-comic mobility worldview
instead of becoming a wealth-accumulation sim.

One line: **plain "family" voice (not warm), "lineage" for structure, "dynasty"
as the doomed aspiration, "bloodline" never.**
