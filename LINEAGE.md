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

`z` is country-mean-relative, so parents from different countries can't be
naively averaged. But the deeper point: **nationality choice models the migration
instinct** — anchor babies, citizenship desirability, wanting a better life.

- Child's **primary nationality = player choice, framed as migration** and
  **friction-gated**: birthing a lineage into a higher-opportunity country (better
  `netWorth` / `gini` / LFP / lower vulnerability — all in the country data) costs
  something or carries odds (reuses the deferred migration hook). It's an
  *achievement*, not a menu pick. The other parent's country becomes tagged
  **ancestry** (feeds heritage collection).
- **Trait conversion:** map both parents' `z` to absolute phenotype via their own
  country's marginal, mid-parent in absolute units, regress toward the *child's*
  chosen-country mean, then re-express as country-relative `z` for §4.2.
- Build same-country first, then enable cross-country (the riskiest module).

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

- [ ] **Phase 0 — Identity & persistence** *(decision-invariant; in progress)*.
      Add `id` / `parentIds` / `generation`; store the dropped `zFw`
      (`roll.js:182`); fix the `lifeKey` (`App.tsx:15`) + `copySig` (`copy.js:83`)
      sibling collisions by keying off `id`; replace the `MAX_KEPT=200` FIFO
      (`App.tsx:9,29`) with lineage-aware durable storage (IndexedDB; never evict
      founders or cards with descendants). *Prerequisite for everything.*
- [ ] **Phase 1 — Fertile individual + gating** (§4.1).
- [ ] **Phase 2 — Child draw** (§4.2–4.4): corrected formula + pre-inflated `R`;
      two-channel wealth incl. the `zFw` restructure; cross-country `z` conversion
      (same-country first).
- [ ] **Phase 3 — Verdict = trajectory** (§4.6): drop the vestigial percentile;
      dynasty net-worth trajectory; anti-compounding damping.
- [ ] **Phase 4 — events.js reconciliation** (§4.7).
- [ ] **— SCOPE GATE —** decide marriage-market scope (§6) here.
- [ ] **Phase 5 — Mate value + marriage market + UX** (§6, §2): per scope. Lineage
      tree; partner selection under the hidden-`z` band; family reveal reconciled
      with the SpinScreen; plain family voice.
- [ ] **Phase 6 — Validation.** Bred-generation sim: `corr(parent z, child z) ≈ H`;
      dynasty net worth shows rise-and-fall (no runaway saturation);
      `corr(height,looks)` green for G1+ (re-targeted per §4.2).

Phases 1–2 must precede Phase 3 — recalibrating a verdict against an undefined
bred population is circular.

---

## 8. Deferred (out of v1, intentionally)

- **Multiplayer trading market** — needs server authority; incompatible with
  localStorage. The marriage market (§6) is its single-player-native sibling.
- **Social/biological decoupling** — donor/adoption/same-sex parents (§2).
- **Migration as a full subsystem** — v1 uses the lightweight friction-gate (§4.4);
  the richer migration arc comes later.

---

## 9. Open questions — status

| Question | Status |
|---|---|
| Core single-player goal | ✅ Generational ascent lifecycle (§1). |
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
