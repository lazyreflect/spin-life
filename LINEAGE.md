# Lineage & Dynasty — Implementation Plan

> **STATUS: DIRECTION LOCKED. BUILDING.** Authoritative spec for the lineage
> feature: two parent cards found a family of children, across generations. The
> core loop, voice, genetic model, and wealth/heritage rules are decided (§1–§5);
> the genetic math is corrected (§4); Phase 0 is underway (§7). One scope fork
> stays open by design — how much of the marriage market lands in v1 (§6).
>
> Supersedes the earlier exploratory `BREEDING.md` and reconciles its two split
> sources (readiness audit + the §2 terminology that was branch-only). Single
> source of truth.

---

## 1. The vision — the generational ascent lifecycle

The game is the **birth lottery** extended across generations. The universal
human instinct it models: *improve your descendants' lot, then keep them from
losing it.* That's not three goals — it's one arc in three acts:

1. **Build** — a (usually poor) founder claws upward. Earn wealth; maybe emigrate
   for better odds (§4.4).
2. **Grow** — convert personal wealth into *generational* wealth: have children,
   give them advantages (a better country, good genes, good marriages).
3. **Preserve** — defend against dissipation. This is the hard act:
   regression to the mean, famine/currency collapse (already in `events.js`),
   and wealth splitting among heirs all drag a dynasty back down.

Because Act 3 is hard, the natural shape is **rise-and-fall**, and a lineage that
actually *holds and rises* across generations is rare — that is the trophy.
Immigration is a **lever**, never the destination; the destination is the
ascent itself.

**Primary metric: net worth.** Wealth is the cleanest measurable scalar and
already the dominant axis (`score.js`). It is the number the player tracks at the
individual and dynasty level. *Status* (what you spend in the marriage market,
§6) is net worth **plus** a social component — a notable career, beauty, a title.

**Secondary hook: collection.** Rare lineages, mixed-heritage combos, a
"Passport" of countries, notable descendants — orthogonal variety on top of the
ascent chase.

---

## 2. Voice & terminology (firm — this is risk, not taste)

The mechanic tracks heritable IQ/height/looks, and `DESIGN.md` flags per-country
IQ as its "shakiest, most contentious" input. Livestock language —
*breeding / stud / dam / litter / bloodline* — on top of heritable-IQ-by-country
reads as a eugenics simulator. Reframing is harm-reduction.

**Voice: plain, not warm.** The game's register is deadpan and dark (it reports a
child dying in a famine at 7 without flinching). Greeting-card warmth clashes with
that *worse* than cold language did. Target **plain human words said flatly** —
*mother, father, children, family*. The same flat voice carries the harsh
mate-market truths of §6: *"No one looked twice at him. Then he made his money.
Suddenly they did."* — stated, never celebrated.

| Avoid (livestock) | Use (plain family) |
|---|---|
| breeding / to breed | starting a family / having children |
| a male + female card | two parent cards / a couple |
| stud / dam / breeding stock | parent (mother / father) |
| litter | children / a generation / siblings |
| breeding value | legacy potential / what they pass on |
| pedigree | lineage / heritage / ancestry |
| foal-cap / fertility cap | family size |
| inbreeding | closely-related pairings |

**Three words, three jobs (they stack):** **Family** = the voice. **Lineage** =
the structure (data model, the tree). **Dynasty** = the chase, framed as
*doomed* — the thing you reach for and usually lose. **Bloodline** = ❌ cut.

*v1 limitation (intentional):* genetics is sex-gated (needs M+F), so the social
framing stays biological for v1. Donor/adoption/same-sex parents deferred (§8).

---

## 3. Locked decisions

| Decision | Locked choice |
|---|---|
| **Core loop** | **Generational ascent** (build → grow → preserve); immigration is a lever (§1). |
| **Primary metric** | **Net worth** (individual + dynasty); status = wealth + social component. |
| **Architecture** | **Closed single-player first** — no trading, no backend (§8). |
| **Country scope** | **Cross-country allowed**, framed as migration (§4.4). |
| **Genotype reveal** | **Proof-tightening band** — hidden `z`, narrows as a card has children (§6). |
| **Fertility** | **Fertile window (theme-first)** — life-bound, realistic ceiling (§4.5). |
| **Wealth transmission** | **Two channels** — position via the mobility loop, disposition via heritable `zFw` (§4.3). |
| **Verdict** | **Trajectory-based** — the vestigial "luckier than X% of births" percentile is dropped (§4.6). |
| **Partner desirability** | **Mate value** — sex-weighted; wealth compensates for physical disadvantage (§6). |
| **Voice** | **Plain family voice; lineage/dynasty/bloodline per §2.** |
| **Marriage-market scope** | ⚠️ **OPEN** — mate value in v1; full dowry economy = v1-lite vs v1-core TBD (§6). |

---

## 4. The model

### 4.0 Lifecycle — the Destiny model *(v1; the living-sim is explicitly out)*

A card's whole life is still rolled at once (death age, events, outcome all
predetermined — the model and its determinism are untouched). What changes is
*when each fact is surfaced*, so a founder can be used as a living progenitor
without the contradiction of "the story ended, now go make babies."

- **Roll = the full predetermined destiny.** Nothing is simulated over time.
- **Death age is rolled but HIDDEN until retirement.** The founding reveal lands
  on **net worth + verdict — the climax — with no death age**; the character reads
  as a person available to found a line, not a corpse with a tombstone.
- **The lifecycle is information-ordering, not simulation:** founder (alive, no
  death shown) → marriage → children (within the fertile window) → *retired* →
  death age revealed as the closing beat → ancestor in the tree.
- **Fertile window is free:** `[FERTILE_AGE, min(ageAtDeath, fertility end)]`,
  known at roll time from the predetermined `ageAtDeath`. Died young → short
  window → few children (§4.5). Fatal events already set `ageAtDeath`, so "some
  events are fatal" needs no new machinery.
- **No live `current age`, no events firing over time, no per-age state.** Showing
  a live current age would oblige an age-consistent current state — the
  "doctor-at-18" problem. The Destiny model dodges it by never depicting per-age
  state: the career is the life's *endpoint*, children happened *across* the life.
- **Content safety:** parents must have reached `FERTILE_AGE` (18); reproduction
  is an abstract genotype combination between established adults, never a depicted
  act — no CSAM surface (Phase 1 enforces the floor).

The full **living-sim** (characters aging in meta-time, events firing live,
age-consistent state, per-career attainment ages) is a different genre and a
large build — **explicitly out of v1 scope** (§8).

### 4.1 Card → a person who can have children *(reframe + gating)*

A card is currently a finished, dead life with an `age` at death
(`roll.js:164-166`); nothing stops selecting a died-at-7 card as a parent.

- Derive a **fertile window** from the existing `ageAtDeath`: eligible if reached
  fertile age (default ≥ 18) and not a maternal-death card.
- **Gating is diegetic** — died-young and childbirth-death cards simply *can't*
  found a line. The cruelty is on-voice.
- Genetics requires **M + F** for v1.

This defines *who is in the bred population*, which is why it precedes any
verdict work (§4.6).

### 4.2 The child trait draw *(corrected)*

Replace the i.i.d. draw `z = corrNormals(L[sex])` (`roll.js:112`) with a
mid-parent model. **One symbol convention:** `H` = heritability (the
offspring-on-midparent regression slope; a variance fraction). Per trait `t`:

```
z_child[t] = H_t · ½(z_father[t] + z_mother[t])  +  sqrt(1 − H_t²·½) · noise
```

`noise` drawn **through `chol(R)`**. `H`: height ≈ 0.8, IQ ≈ 0.5, looks ≈ 0.35.
Then the existing marginal mapping runs unchanged → marginals preserved. Free
side effect: **regression to the mean** — elite parents usually get a lesser
child, occasionally (noise tail) a standout. That tail is the chase.

**Two corrections (load-bearing):**
1. **`chol(R)` alone does NOT preserve `corr(height,looks)`.** Mid-parent
   averaging attenuates the cross-trait correlation by
   `0.5·H₁·H₂ + sqrt((1−H₁²/2)(1−H₂²/2))`, < 1 when heritabilities differ
   (height 0.8 / looks 0.35 → 0.20 → ~0.188). **Fix:** pre-inflate `R` so realized
   G1+ correlation hits target. `chol(R)` fixes only the noise term.
2. **Child residual uses the child's own sex matrix** `L[childSex]` (sex is 50/50).

**Genes from parents, environment from the child's country.** Heritable potential
comes from the two parents (the formula above); the **child's own country is the
regression anchor** the trait maps through — `child = childCountryMean +
childCountrySD·z_child`. That anchor *is the environment*: a poor-nutrition country
has a lower mean, so a child there realises less of their inherited height/IQ
potential (and migration to a richer country realises more). No global mean — the
child has exactly one environment country, so the anchor is unambiguous.

### 4.3 Wealth — two channels *(position + disposition)*

Wealth is heritable two ways, modeling nature *and* nurture without
double-counting:

- **Position (nurture)** — inherited via the existing mobility loop: child's
  `parentRank` = the parents' realized `childRank` (`roll.js:115-139`). You are
  born into your parents' standing; `β < 1` + luck-dominant noise means it erodes
  without merit. This is the dissipation that makes Act 3 (§1) hard.
- **Disposition (nature)** — the heritable `zFw` latent, transmitted via §4.2.
  **Restructure required:** today `zFw` *generates* `parentRank`
  (`parentRank = normCdf(z[0])`), so they're currently the same thing. `zFw` must
  **move jobs** — from "origin generator" to a **trait input** to the child's own
  earning/mobility (like IQ feeds events), while position now comes from the
  parents' standing. Contained but real `rollLife` change.

Net: a child inherits both a starting rung (position) and an earning knack
(disposition), and can still fall — exactly the rise-and-fall spine.

### 4.4 Cross-country = migration *(not a coin-flip)*

**Nationality choice models the migration instinct** — anchor babies, citizenship
desirability, wanting a better life.

- Child's **primary nationality = player choice, framed as migration** and
  **friction-gated**: birthing a lineage into a higher-opportunity country (better
  `netWorth` / `gini` / LFP / lower vulnerability — all in the country data) costs
  something or carries odds (reuses the deferred migration hook). It's an
  *achievement*, not a menu pick. The other parent's country becomes tagged
  **ancestry** (feeds heritage collection).
- **No cross-country "conversion" module.** Because the child has exactly one
  environment country (§4.2), cross-country collapses to: express each parent's
  trait *in the child's one country's frame*, then run §4.2. Same-country is the
  identity case (parents already in that frame); cross-country is a trivial
  per-trait re-expression, not a two-country reconciliation. The genetically real
  result falls out — a tall-country parent's height partly transmits and the child
  regresses toward *its* country's mean. The earlier "riskiest module" dissolves.
- **Sex-dimorphic height** stays sex-standardized (each parent's `zHeight` is
  relative to their own sex), so a tall father raises a daughter's height in
  female terms, not by his absolute cm. v1 ships same-country; cross-country adds
  only the per-trait country-mean re-expression for IQ/height.

### 4.5 Fertility — the fertile window *(theme-first)*

- Children occur across the person's fertile years; **the life is the limit**.
  Died-young / maternal-death cards have few or none (§4.1).
- **Realistic hard ceiling** (default ~6/person) so "the long-lived rich have
  more heirs" is present as theme but can't break the tiers. Count scales with
  fertile years lived, capped.
- A **couple** produces a *family*, revealed as one event (reconcile with the
  single-reveal SpinScreen in Phase 5).
- **Embrace then collapse the inequality:** counter the rich-breed-more loop the
  on-brand way — regression (§4.2) + famine/collapse events make dynasties fall.
  The proof-tightening band (§6) is tuned by this: a few children **partially**
  resolve hidden `z` (the fun) but **never fully** (speculation survives).

### 4.6 Verdict — trajectory, not population percentile

The old headline "Luckier than X% of all births" reads a CDF over a *random-birth*
population (`luckCdf.json`, `score.js`); bred children aren't samples from it, so
it's wrong past G0. **It is also vestigial from prior development → drop it** in
lineage mode rather than contort to recalibrate it.

- The per-life **Fortune score** (wealth-dominant, `score.js`) stays as the
  individual verdict.
- The **meta-verdict is the lineage's trajectory**: did the dynasty *ascend, hold,
  or collapse*, measured in dynasty net worth across generations (§1). On-theme,
  and far simpler than a unified-CDF retrofit.
- **Net worth is the founding-reveal climax, not death** (§4.0). The reveal lands
  on net worth + verdict; the death age is withheld until retirement, when it
  becomes the closing beat. "Final net worth" → "Net worth" (no morbid qualifier
  on the primary metric). Lifespan stays visible only when it's the story — a
  tragic/cut-short death — or a remarkable-longevity flat-out outlier.
- Keep light **anti-compounding damping** so iterated selection doesn't trivially
  pin individual scores (`luckSd=0.10` headroom at `events.js:289` is tuned for
  one-shot births).

### 4.7 events.js reconciliation

`events.js` narrates a **shadow family** with real effects that will contradict
the real one: `married` "married into wealth" `+0.22` (`events.js:144`),
`widowed`/`divorce`/`lostchild` (`:121-123`), `maternal` `fatalP:0.85`
(`events.js:108`). **Gate these against real partner/children state** — suppress
or convert into marriage/lineage outcomes (§6) so a card can't "marry into wealth"
while paired with a poor partner.

### 4.8 Inbreeding — genetic consequences (the Habsburg trap) *(designed, not built)*

`pairBlock` gates eligibility / same-card / M+F but **not relatedness**, so
closely-related pairings are currently possible. Don't just block them —
inbreeding depression is the most on-theme mechanic available: dynasties marry kin
to keep wealth/power consolidated (the preservation motive, §1) and rot the gene
pool (the Habsburgs → Charles II; royal hemophilia). The optimal-looking
"don't dilute the line" move is the trap that kills it — "dynasty as doomed" (§2)
made *mechanical* and self-inflicted.

**Model — scale by the offspring inbreeding coefficient F** (computable from
`parentIds`, the lineage graph):
- parent×child / full sibs → **F = 0.25**; half-sib / uncle-niece / grandparent-
  grandchild → **0.125**; first cousins → **0.0625**.
- **Mean depression:** subtract `depression_t · F` from the child's `z`, heaviest
  on fitness traits (IQ, lifespan, health), lighter on neutral ones.
- **Elevated mortality / defects:** boost died-young + fatal probability `∝ F`
  (reuses the existing mortality machinery).
- **Fatter bad tail, not just a lower mean:** inbreeding exposes rare recessives →
  add **variance** (the occasional Charles II), not only a downward shift.
- **Compounds:** F accumulates in a closed line → gradual self-inflicted decay.

**Tone split (decided):** hard-block the incest-taboo cases (parent×child, full
sibs) in `pairBlock`; allow cousins / uncle-niece / distant **with consequences**
(the Habsburg mechanic — not taboo, just unwise) plus a "closely related" warning
in the pairing bar. The game never depicts parent-child incest.

**Implementation shape:** kinship F is computed in the UI/lineage layer (it has
the full `lives` graph) → passed as `opts.inbreeding = F` into `rollChild` →
z-penalty + variance in the draw, mortality boost in `buildLife`. Localized.

---

## 5. Value & the partner hunt

A card has two values: the **life it lived** (collector) and **what it passes on**
(hidden `z`), which diverge because displayed IQ/height/looks are clamped while
raw `z` is stored (`distributions.js:9`, `roll.js:117-119`). The
**proof-tightening band** shows a noisy legacy-potential range that narrows with
each child — pedigree, scouting, speculation under uncertainty. That uncertainty
is what the marriage market (§6) prices.

---

## 6. Mate value & the marriage market *(the single-player economy)*

The insight: a real **trading economy exists without multiplayer** — the marriage
market. It's the mechanical engine of Act 3 (preserve, §1).

**Mate value** — each card's desirability to partners, a **sex-weighted** blend:
- A **male** card leans on **status/wealth** first, **height** meaningfully, looks
  moderately.
- A **female** card leans more on **looks/youth**, status mattering less but never
  zero.
- **Crucially, wealth/status compensates for physical disadvantage** — a short,
  plain, *rich* card still marries well; a beautiful, *poor* card is still sought.
  This is the pricing function that makes "flawed" and mid-tier cards valuable.
- *(These are deliberately stereotyped mating-market generalizations — same
  sensitivity class as the country-IQ data. Modelable, but the §2 voice rule
  applies: state flatly, never celebrate.)*

**The marriage market (dowry):**
- High-mate-value partners are **priced** — you afford them with your card's own
  mate value plus a **wealth transfer (dowry/bride price)**.
- **Marrying up** costs a dowry but raises children's starting position + injects
  better genes; **marrying down** is cheap but dilutes the lineage.
- **Preservation becomes active:** if you don't spend to marry heirs well, the
  default is marrying down → wealth disperses → regression wins. Keeping a dynasty
  rich is a fight each generation — historically exact (dowries, advantageous
  matches).
- Partners can be **system-generated or drawn from your own collection**; no
  backend needed.

**⚠️ Scope is OPEN (the one undecided fork):**
- **v1-lite** — mate value + assortative partner desirability ship in v1 (partner
  choice has real trade-offs: genes vs status vs heritage), full dowry economy
  deferred. *(Current lean — minimum that makes it a game, not a simulator.)*
- **v1-core** — full dowry/wealth-transfer economy + the dynasty lose-condition in
  v1. The complete fantasy, biggest build.
- **fast-follow** — genetics/lineage only in v1; marriage market next.

Decide before Phase 5 (UX); does **not** block Phases 0–4.

---

## 7. Build sequence

- [x] **Phase 0 — Identity & persistence** — `id`/`parentIds`/`generation`, stored
      `zFw`, `lifeKey`/`copySig` keyed off id, lineage-aware eviction
      (`capLives`, stayed on localStorage not IndexedDB — see §8 note).
- [x] **Phase 1 — Fertile individual + gating** — `src/model/lineage.js`
      (`parentEligibility`, `pairBlock`).
- [x] **Phase 2 — Child draw** (a/b/c) — `src/model/genetics.js` (`makeChildDraw`,
      solved noise), `rollChild` + `buildLife` refactor, two-channel wealth,
      cross-country single-environment reframe.
- [x] **Destiny model + reveal** — death age hidden for ordinary lives, "Net
      worth" climax (§4.0).
- [x] **Phase 5a — Playable pairing loop** — select 2 parents → Start a family →
      child reveal → keep (`MyLives`).
- [x] **Phase 4 — events.js reconciliation** — `displayEvents`, marriages recorded
      (`partnerIds` via `App.recordPairing`).
- [ ] **Inbreeding consequences** (§4.8) — *next up.* Kinship F from `parentIds`,
      F-scaled depression + mortality + tail variance, immediate-family block,
      "closely related" warning.
- [ ] **Litter** — a pairing currently makes ONE child; the plan wants a family of
      N (each an independent draw). Product call on count/feel.
- [ ] **Phase 3 — Verdict = trajectory** (§4.6): drop the vestigial "luckier than
      X% of births" line (still showing in `Card.tsx`); dynasty net-worth
      trajectory; anti-compounding damping. *(Replacement for the dropped line is a
      UX call.)*
- [ ] **— SCOPE GATE —** decide marriage-market scope (§6).
- [ ] **Phase 5 — Mate value + marriage market + lineage tree UX** (§6, §2).
- [ ] **Phase 6 — Validation** — bred-generation sim invariants.

Done through the playable loop; remaining items lean on product calls (litter
count, percentile replacement, marriage-market scope).

---

## 8. Deferred (out of v1, intentionally)

- **Multiplayer trading market** — needs server authority; incompatible with
  localStorage. The marriage market (§6) is its single-player-native sibling.
- **Social/biological decoupling** — donor/adoption/same-sex parents (§2).
- **Migration as a full subsystem** — v1 uses the lightweight friction-gate (§4.4);
  the richer migration arc comes later.
- **Living-sim mode** — characters aging in meta-time, events firing live, a live
  current age, age-consistent state, per-career attainment ages. v1 is the Destiny
  model (§4.0); the living-sim is a different genre, deferred.

---

## 9. Open questions — status

| Question | Status |
|---|---|
| Core single-player goal | ✅ Generational ascent lifecycle (§1). |
| Lifecycle / temporal model | ✅ Destiny model — predetermined life, death hidden until retirement; living-sim out (§4.0). |
| Primary metric | ✅ Net worth (§1). |
| Closed vs market | ✅ Closed single-player first (§3, §8). |
| Genotype reveal | ✅ Proof-tightening band (§6). |
| Same- vs cross-country | ✅ Cross-country, as migration (§4.4). |
| Fertility model | ✅ Fertile window, theme-first (§4.5). |
| Wealth transmission | ✅ Two channels: position + heritable disposition (§4.3). |
| Verdict scale | ✅ Trajectory; drop vestigial percentile (§4.6). |
| Partner desirability | ✅ Mate value, wealth compensates (§6). |
| Voice / framing | ✅ Plain family voice (§2). |
| **Marriage-market scope** | ⚠️ **OPEN** — v1-lite vs v1-core vs fast-follow (§6). Decide at the Phase-4/5 gate. |

Remaining beyond the scope fork is **build-time tuning** (fertile-window numbers,
cross-country `z`-conversion calibration, `R` pre-inflation factor, mate-value
weights) — resolved empirically against the Phase 6 suite, not by design debate.

---

## 10. v2 direction — the small-clan game (from population sims, 2026-06-17)

A round of interactive population simulations reshaped the feature. After the
playable loop shipped, the pairing UI felt flat — and the reason was diagnostic:
**the spin is fun because it's *fate + story*; deliberate pairing made it
*management*.** A series of sims found the version that keeps the fun. This
refines §1–§9 (same model, voice, ascent theme); it does not replace them.

### 10.1 Findings
- **Scale: a clan, not a nation.** No player curates 200 founders — **10–20 is
  realistic.** At that scale the game is *intimate* (you know your characters) and
  bridges saga + population on one screen.
- **Friction → fate.** The app should **pick the couple randomly** (an eligible
  bachelor + a partner). Pairing *becomes a spin* instead of admin. The player's
  real levers are **how good a pool you build** (spin) and **which offspring you
  advance** (selection) — strategy without a management screen.
- **Twin antagonists pull every clan down:**
  - **Extinction** — a 10-founder start has **~16% chance of dying out in 8
    generations** (sex imbalance / died-young runs). ~15 is the safe floor.
    "How big a pool before I breed?" is a real risk/reward call (roguelike stakes).
  - **Inbreeding** — small pools **homogenize fast** (15–20 founders → ~2 countries,
    lose a third of founder lines in 8 generations). **§4.8 (the Habsburg trap) is
    the CORE antagonist at this scale, not an edge case.**
- **Spin is the lifeblood — the unlock.** Spinning fresh founders is the only
  antidote to inbreeding/extinction (+4–5 spins/gen doubles diversity, keeps
  founder lines growing). **This makes the spin — the proven-fun loop —
  mechanically essential to breeding.** The two loops finally need each other:
  you spin to keep your gene pool alive, not to "collect."
- **Differential fertility dominates aggregates; the population median is the
  wrong goal.** The poor out-breed everyone, so any population average is dragged
  toward poverty (median founder $5.9k vs **mean $77.6k** — a 13× fat tail).
  **Migration can't lift the median** (emigrants move to low-TFR rich countries →
  breed less → can't beat differential fertility — confirmed: even 55% emigration
  stays trapped). **Only selection moves the median.** So:
  - **Don't optimize the population median** — it's fertility-doomed and bleak.
  - **Cultivate YOUR line against the tide.** Selection (keep the best kids) +
    migration (get *your* line out) on your chosen lineage. The bleak population is
    the *backdrop that makes one ascending line mean something* — saga + dynasty,
    unified.
- **Migration = individual escape + diversification, never aggregate uplift.**
  Auto-defaulting a mixed kid to the better parent's country is **degenerate**
  (sim ran away to a $122k / 78%-monoculture). Migration must be **earned**: the
  rare `emigrate` event **repurposed to relocate a character's descendants** to a
  richer country (clean in the Destiny pipeline — it changes where the *kids* are
  born, not the parent's own baked life), or a priced player choice. It lifts the
  chosen line, at a cost, never everyone for free.

### 10.2 The v2 loop
Start a small clan (spin ~10–20) → **fate pairs them off** → each couple has a
**litter by country TFR, all born at once** (siblings diverge → free drama) →
read the saga / **curate the best to advance** → **spin fresh blood** to fight
inbreeding & extinction → your line ascends (or dies) against a world sliding
toward the mean. The couple **retires after one litter** (turnover → spin pressure).
The reward is the **story** (§ connect a child's copy to its real parents and the
generational arc — "rose above his father" / "the line ended at 4").

### 10.3 Open tuning (TODO before building the v2 loop)
- ✅ **Real per-country TFR — DONE** (`sim/fetch-tfr.mjs`, World Bank
  `SP.DYN.TFRT.IN`, merged into `countries.json` as `tfr`; 215/241 filled, 26 tiny
  territories fall back to 2.2). Replaces the `1.4 + 0.08·empAg` proxy (ran ~4 vs
  real ~2.3 and masked organic demographics). Real values land where expected —
  Korea 0.72, Italy 1.21, Japan 1.2 (collapse beats); Niger 6.06, Nigeria 4.48;
  India 1.98, US 1.62. See **§10.5** for what driving the model with it revealed.
- **Carrying cap = a backstop** (famine / attention limit), **not** the per-turn
  population setter.
- **Seed size** (10 = roguelike-risky vs 15–20 = safe) and **fresh-spin rate**.
- **Litter size** sampled around TFR (Poisson), so low-TFR couples sometimes roll
  **zero** — the line just ends.

### 10.4 The honest bet
Random pairing means the player *discovers* the story rather than authoring it —
so **the writing is the entire product.** Prototype the **litter reveal + saga
copy** (a child's story against its real parents) *before* the pool/odds/TFR
plumbing: prove the stories are fun to read, then build the loop that generates
them.

> ⚠️ **Status note (2026-06-17):** the saga-copy prototype was **shelved** — a
> first pass of hand-drafted parent-anchored sagas didn't land ("not that
> interesting"). The honest-bet thesis (*the writing is the entire product*) is
> therefore **unproven, not confirmed.** Energy moved to the demographic model
> instead (§10.5). Revisit the writing later; don't assume it's the hook.

### 10.5 What the clan sim found (real TFR, 2026-06-17)
Built `sim/clan.mjs` — drives the **shared** model (`rollLife` founders +
`rollChild` offspring) forward at clan scale: fate-pairs eligible couples, one
litter per couple sized **Poisson(mother-country TFR)**, couples retire after a
litter (§10.2). Two modes: one clan narrated generation-by-generation (the
intimate "watch it live" view) and `--trials N` for the distribution. Findings:

- **Extinction is real and scales with seed size** — over 8 generations: **~35%
  extinct from 10 founders, ~10% from 15, ~8% from 20.** Roguelike stakes,
  confirmed — and *higher* than the old hot-proxy run, because real (lower) TFR
  kills more lines. "How big a pool before I breed?" is a genuine risk call.
- **Diversity collapses fast and visibly** — 9 countries → 1, 12 founder lines →
  4 in a single 8-gen run. The homogenization (the §4.8 inbreeding antagonist) is
  now an on-screen number, not a footnote.
- **⚠️ There is NO natural clan-scale equilibrium.** Among survivors, **0 "held"
  near the seed size** — an unmanaged clan either **dies (~35% at start-10)** or
  **booms into the hundreds/thousands** by gen 8. The model has no stable middle.
  This contradicts the §10 mental image of "a clan that hovers at 10–20." Two
  consequences, both promoting design pieces from optional to **load-bearing**:
  - **Player curation IS the core verb.** Advancing only a handful of kids per
    generation is the *only* thing that keeps the clan knowable. The cull is not a
    backstop (§10.3) — it's the main loop. The carrying cap is the hard ceiling
    behind it.
  - **Which country the line pools into becomes its fate.** The die-vs-boom split
    is driven by the TFR of the country the bloodline homogenizes into (Korea 0.72
    → wither; Niger 6.06 → explode). This is a strong emergent story hook and makes
    **migration (§10's earned-escape lever) mechanically central**, not flavor:
    relocating your line is choosing its demographic destiny.
- **Wealth stays bleak at clan scale too** — survivor median net worth
  ~$1.3k–1.9k, unchanged from the population view (§10.1). Differential fertility
  still dominates; only selection moves your line. Holds.

**Unvalidated next** (not yet built): model the curation loop in the sim (advance
best-K + real cap → prove it produces the playable hovering clan); quantify the
country-pooling die/boom split and test migration as the lever.
