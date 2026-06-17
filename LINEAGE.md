# Lineage & Dynasty — Implementation Plan

> **STATUS: DECISIONS LOCKED. BUILD-READY.** This is the authoritative spec for
> the lineage feature (a male + female card found a family of child cards). It
> supersedes the earlier exploratory `BREEDING.md` — the four design forks are
> resolved (§1), the genetic math is corrected (§4), every open question has an
> answer (§8), and the work is sequenced into phases (§6). What remains open is
> build-time tuning and the explicitly-deferred trading market (§7), not design.
>
> This doc reconciles two previously-split sources: the readiness audit (was on
> `main`) and the terminology/voice section (§9, was branch-only). Single source
> of truth now.

---

## 1. Locked decisions

| Decision | Locked choice | Why |
|---|---|---|
| **Architecture** | **Closed single-player first** — no trading, no backend | Trading is the expensive, fraud-exposed half; lineage is the fun, tunable half and needs no market to be enjoyable. Market deferred (§7). |
| **Country scope** | **Cross-country allowed** in v1 | Mixed-heritage children are the most interesting case; we take the modeling cost now (§4.4). |
| **Genotype reveal** | **Proof-tightening band** | Hide raw latent `z`; show a noisy "legacy potential" band that narrows as a card has children. The information-asymmetry lever is the core of value (§5). |
| **Fertility** | **Fertile window (theme-first)** | Children happen across a life; died-young / childbirth-death cards have few or none. The mortality already in the model does the limiting, cruelly and on-voice (§4.5). |
| **Voice** | **Plain family voice; lineage = structure; dynasty = doomed; bloodline never** | The wording is *risk*, not taste, next to a heritable-IQ mechanic. See §2. |

The wealth half (`parentRank → mobility → childRank`) largely reuses existing
calibrated code; the trait/copula draw, the verdict recalibration, the
`events.js` reconciliation, and the UX surface are the real work.

---

## 2. Voice & terminology (firm — this is risk, not taste)

The mechanic tracks heritable IQ/height/looks, and `DESIGN.md` already flags
per-country IQ as its "shakiest, most contentious" input. Livestock language —
*breeding / stud / dam / litter / bloodline* — on top of heritable-IQ-by-country
reads as a eugenics simulator, not a birth-lottery toy. Reframing is
harm-reduction.

**Voice: plain, not warm.** The game's actual register is deadpan and dark (it
reports a child dying in a famine at 7 without flinching). Greeting-card warmth
clashes with that *worse* than cold language did. Target **plain human words
said flatly** — *mother, father, children, family*. On-brand example:
*"Born to two parents who never met. Four children. Died at 81; none came to the
funeral."*

**Mapping (player-facing):**

| Avoid (livestock) | Use (plain family) |
|---|---|
| breeding / to breed | starting a family / having children |
| a male + female card | two parent cards / a couple |
| stud / dam / breeding stock | parent (mother / father) |
| litter (of N) | children / a generation / siblings |
| breeding value | legacy potential / what they pass on |
| pedigree | lineage / heritage / ancestry |
| foal-cap / fertility cap | family size |
| inbreeding | closely-related pairings |
| partner-seeking | **partner** (already fine — keep) |

**Three words, three jobs (they stack):**

| Word | Job |
|---|---|
| **Family** | the **voice** — moment-to-moment, plain |
| **Lineage** | the **structure** — data model, the tree (§3 Phase 0) |
| **Dynasty** | the **chase** — the rare trophy, framed as *doomed* |
| **Bloodline** | ❌ **cut** — most eugenics-coded; never use |

**Dynasty is the thing you reach for and usually lose.** A triumphant
accumulate→ascend→win dynasty fights the game's soul (the birth lottery, where
most lives *don't* ascend) and is the pay-to-win failure mode. Regression to the
mean drags elite children back toward average, and a famine / currency collapse
(already in `events.js`) can erase three generations in one card. **A collapsing
dynasty is more on-brand than a triumphant one** — and §4.3 + §4.6 make that a
*mechanical* fact, not just flavor.

*Note (v1 limitation, intentional):* the genetics layer is sex-gated (needs
M+F), so the *social* framing stays biological for v1. Decoupling it
(donor/adoption, same-sex parents) is deferred (§7), not forgotten.

---

## 3. Phase 0 — Identity & persistence foundation *(decision-invariant)*

Needed under every version of the feature; nothing else can start without it.
The current model resists lineage because a card is an anonymous, content-hashed
finished life.

- **Stable identity.** Add `id` (uuid), `parentIds: [fatherId, motherId] | null`
  (null = founder/G0), and `generation` (0 = spun). Today identity is
  `lifeKey = code|name|age|netWorth|luckPct` — a *content* hash
  (`src/App.tsx:15`).
- **Fix the sibling-collision bug.** Children share country + name cluster +
  similar stats → `lifeKey` collision → `keep()` silently drops one
  (`App.tsx:26-31`); same root cause hits `copySig` (`copy.js:83`) → two
  children render identical copy. Key everything off `id`, and seed copy
  generation from `id`.
- **Persist all four latents.** `roll.js:182` stores `zIq, zHeight, zLooks` but
  **drops `zFw`** (the wealth latent). Store all four — genotype is the heritable
  payload.
- **Lineage-aware durable storage.** Replace `MAX_KEPT = 200` + `.slice(0,200)`
  FIFO (`App.tsx:9,29`) — it silently deletes the oldest cards, i.e. the
  founders. Move to IndexedDB; never evict a founder or any card with
  descendants.

---

## 4. The model

### 4.1 Card → a person who can have children *(reframe + gating)*

A card is currently a finished, dead life with an `age` at death
(`roll.js:164-166`); nothing stops selecting a died-at-7 card as a parent.

- Derive a **fertile window** from the existing `ageAtDeath`. Eligibility:
  reached fertile age (default ≥ 18), and not a maternal-death card.
- **Gating is diegetic, not a rule screen** — died-young and childbirth-death
  cards simply *can't* found a line. The cruelty is the point and is on-voice.
- Genetics requires **M + F** (sex-gated) for v1.

This step defines *who is in the bred population* — which is why it precedes
verdict recalibration (§4.6).

### 4.2 The child trait draw *(corrected)*

Replace the i.i.d. draw `z = corrNormals(L[sex])` (`roll.js:112`) with a
mid-parent model. **One symbol convention:** `H` = heritability (the
offspring-on-midparent regression slope; a variance fraction). Per trait `t`:

```
z_child[t] = H_t · ½(z_father[t] + z_mother[t])  +  sqrt(1 − H_t²·½) · noise
```

with `noise` drawn **through `chol(R)`**. `H` values: height ≈ 0.8, IQ ≈ 0.5,
looks ≈ 0.35. Then run the existing marginal mapping unchanged → marginals
preserved. Free side effect: **regression to the mean** — elite parents usually
get a lesser child, occasionally (noise tail) a standout. That tail is the chase.

**Two corrections the review caught — both load-bearing:**

1. **`chol(R)` alone does NOT preserve `corr(height,looks)`.** Mid-parent
   *averaging* attenuates the cross-trait correlation by
   `0.5·H₁·H₂ + sqrt((1−H₁²/2)(1−H₂²/2))`, which is < 1 whenever heritabilities
   differ (height 0.8 / looks 0.35 → G1 `corr` drops 0.20 → ~0.188). **Fix:**
   pre-inflate `R` so the *realized* G1+ correlation hits the target, or
   re-target the sim gate for bred generations. `chol(R)` fixes only the noise
   term; the heritable term must be corrected too.
2. **Child residual uses the child's own sex matrix** `L[childSex]` (child sex is
   50/50), not the parents'.

### 4.3 Family wealth — ONE transmission path *(avoid double-counting)*

The parents' adult wealth (`childRank`) becomes the child's origin
(`parentRank`), then the existing §4.3 mobility equation runs (`roll.js:115-139`).
`β < 1` + luck-dominant noise → dynasties erode without merit.

**Decision: wealth transmits via the mobility loop ONLY.** Do *not* also treat
`zFw` as heritable through §4.2 — transmitting both would apply wealth
heritability twice. `zFw` is still stored (Phase 0) for completeness and possible
display, but it is not a heritable channel. This also means a bred child's
`parentRank` = the parents' realized `childRank`, **not** the uniform `N(0,1)`
origin the calibration assumes → the synthetic-parent machinery
(`parentOcc`/`originStanding`, `roll.js:103,132-133`) is replaced by the real
parents' standing, and `jumpSd`/arc-rarity is recalibrated (§4.6). This is a
structural `rollLife` change, not plumbing.

### 4.4 Cross-country heritage *(the hardest module)*

`z` is **country-mean-relative**, so you cannot average a parent measured against
Country A with one measured against Country B. Approach:

1. Child takes **one nationality** for the career/marginal engine
   (`content.js:42-108`: employment shares, LFP, ISCO, names, wealth quantile);
   the other parent's country is tagged as **ancestry** (drives heritage
   collecting + the deferred migration arc).
2. For each heritable trait: map both parents' `z` to **absolute phenotype** via
   their own country's marginal, take mid-parent in absolute units, regress
   toward the **child's** chosen-nationality mean, then re-express as the child's
   country-relative `z` before §4.2's shrinkage/noise.

Exact calibration of step 2 is a Phase-2 build task and the riskiest single
piece; restrict early testing to same-country pairs, then enable cross-country.

### 4.5 Fertility — the fertile window *(theme-first)*

- Children occur during the person's fertile years; the **life itself is the
  limit**. Died-young / maternal-death cards have few or none (§4.1).
- **Realistic hard ceiling** (default ~6 children/person) so the "long-lived rich
  have more heirs" loop is *present as theme* but can't run to 30 heirs and break
  the score tiers. Number of children scales with fertile years lived, capped at
  the ceiling.
- A **couple** produces a *family* — children generated against both parents'
  remaining fertility budget, revealed as one event (fits the family register;
  reconcile with the single-reveal SpinScreen in §5/Phase 5).
- **Embrace then collapse the inequality** (don't engineer the loop out): the
  on-brand counterweights are regression (§4.2) + the existing famine/collapse
  events, which make dynasties demonstrably fall. The proof-tightening band
  (§5) is tuned by this: a handful of children **partially** resolves a card's
  hidden `z` (the fun) but **never fully** (speculation survives).

### 4.6 Verdict recalibration *(after 4.1–4.5 define the population)*

The verdict reads a CDF over a **random-birth** population (`luckCdf.json`,
`score.js`); `mu, sd, jumpSd, occSorted` are baked from 30k random draws
(`roll.js:77-101`). Bred children are **not** samples from that population →
`rarity`, `luckPct`, and the headline "Luckier than X% of all births" are
systematically wrong past G0.

- **Decision: one unified, regenerated scale.** Regenerate the Fortune-score CDF
  over a representative population that **includes simulated lineage
  generations** under the locked draw (§4.2–4.5) **with assortative selection
  modeled** (players pick correlated parents, which inflates variance — price it
  in here rather than try to remove it per-card). All cards, spun and bred, read
  against this one CDF. The headline shifts honestly from "all births" to "all
  lives."
- **Anti-compounding damping** so iterated selection doesn't pin the top tiers
  (the existing `luckSd=0.10` headroom at `events.js:289` is tuned for one-shot
  births, not iterated selection).
- Recalibrate `jumpSd` for the non-uniform bred `parentRank` (§4.3).

### 4.7 events.js reconciliation

`events.js` already narrates a **shadow family** with real effects that will
contradict the real one: `married` "married into wealth" `+0.22`
(`events.js:144`), `widowed`/`divorce`/`lostchild` (`:121-123`), `maternal`
"died in childbirth" `fatalP:0.85` (`events.js:108`). **Gate these against real
partner/children state** (suppress or convert to lineage outcomes) so a card
can't "marry into wealth" while paired with a poor partner, or be a four-family
mother who "died at 19 in childbirth" in her own story.

---

## 5. Value & the partner hunt *(why the band is the core)*

A card has two values: the **life it lived** (collector) and **what it passes
on** (the hidden `z`). They diverge — a mediocre life can hide elite genes,
because displayed IQ/height/looks are clamped while raw `z` is stored
(`distributions.js:9`, `roll.js:117-119`). The **proof-tightening band** (locked)
shows a noisy legacy-potential range that narrows with each child — pedigree,
scouting, speculation. Players seek partners to: stack traits (regression fights
them → a chase, not a purchase), build a dynasty's wealth, collect rare/ mixed
heritage, fill a threshold ("elite IQ but short → need a tall partner"), or use a
parent with a proven record. Different motives keep demand diverse — **but note:**
the live score is wealth-dominant (`score.js`), so absent a separate heritage/
collection scalar, motives collapse toward "maximize `childRank`." The honest
claim is *slow convergence to a meta, refreshed by fresh founders*, not "no
meta." (Fully relevant only once trading exists — §7.)

---

## 6. Build sequence

- [ ] **Phase 0 — Identity & persistence** (§3). `id`/`parentIds`/`generation`;
      store `zFw`; fix `lifeKey`/`copySig`; IndexedDB, lineage-aware eviction.
      *Prerequisite for everything.*
- [ ] **Phase 1 — Fertile individual + gating** (§4.1). Fertile window;
      eligibility; M+F requirement.
- [ ] **Phase 2 — Child draw** (§4.2–4.4). Corrected mid-parent formula +
      pre-inflated `R`; single wealth path (§4.3); cross-country `z` conversion
      (same-country first, then enable cross).
- [ ] **Phase 3 — Verdict recalibration** (§4.6). Regenerate unified CDF over
      simulated lineages w/ assortative selection; anti-compounding damping;
      `jumpSd` refit.
- [ ] **Phase 4 — events.js reconciliation** (§4.7).
- [ ] **Phase 5 — UX + voice** (§2, §5). Lineage tree; partner selection under
      the hidden-`z` band; family reveal reconciled with the SpinScreen; plain
      family voice throughout.
- [ ] **Phase 6 — Validation.** Bred-generation sim asserting: `corr(parent z,
      child z) ≈ H`; mean `childRank` ≈ 0.5 over N generations; tiers don't
      saturate under iterated selection; `corr(height,looks)` green for G1+
      (re-targeted per §4.2 attenuation).

Sequencing note: Phases 1–2 **must** precede Phase 3 — recalibrating the verdict
against a bred population that hasn't been defined yet is circular (the original
exploration had this backwards).

---

## 7. Deferred (out of v1 scope, intentionally)

- **Trading market** — needs server authority (ownership, anti-dupe, scarcity);
  incompatible with localStorage. Closed single-player first; add a market only
  once the loop is proven. Founder-scarcity / family-size caps / sinks /
  generation tax become live levers then.
- **Social-vs-biological decoupling** — donor/adoption, same-sex parents (§2
  note).
- **Dead-card tradability as pedigree** — moot without a market; dead cards
  persist as ancestors in the tree regardless (§3).

---

## 8. Open questions — now resolved

| Question (was open) | Resolution |
|---|---|
| Closed-economy-first vs market up front | **Closed single-player first** (§1, §7). |
| How much genotype to reveal | **Proof-tightening band** (§1, §5). |
| Same-country-only vs cross-country now | **Cross-country allowed**; same-country first in build, then enable (§4.4). |
| Fertility model | **Fertile window, theme-first**, realistic ceiling ~6 (§4.5). |
| Dead cards tradable as pedigree | Deferred with the market; dead cards persist as ancestors regardless (§7). |
| Separate "bred" verdict scale vs one CDF | **One unified, regenerated CDF** incl. simulated lineages + assortative selection (§4.6). |
| Wealth double-counting (`zFw` vs mobility loop) | **Mobility loop only**; `zFw` stored but not heritable (§4.3). |
| Sex matrix for child residual | **Child's own sex** matrix (§4.2). |
| Assortative-mating variance inflation | **Priced into the recalibrated CDF**, not removed per-card (§4.6). |
| Voice / framing | **Plain family voice; lineage/dynasty/bloodline split per §2.** |

Remaining genuinely-open items are **build-time tuning** (exact fertile-window
numbers, the precise cross-country `z`-conversion calibration, the `R`
pre-inflation factor) — resolved empirically against the Phase 6 validation
suite, not by design debate.
