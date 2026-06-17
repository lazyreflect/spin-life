# Lineage feature — session handoff

Pick up the **lineage / dynasty** feature cold. This is the *current build state*;
the spec and rationale live in **[LINEAGE.md](LINEAGE.md)**. For the base game read
**[HANDOFF.md](HANDOFF.md)** and **[DESIGN.md](DESIGN.md)**.

## TL;DR — where it stands

The **playable lineage loop works end-to-end** and is merged to `main`:
spin founders → keep → **My Lives** → select two eligible parents (one mother, one
father) → **Start a family** → the child reveals with the real card → keep → it
joins the collection as the next generation. Genetics, two-channel wealth,
cross-country environment, marriage links, and shadow-family-event reconciliation
are all in. Nothing is deployed-blocking; sim/tsc/build are green.

Read **LINEAGE.md** first — §3 is the locked decisions, §4 is the model, §7 is the
build checklist. **Then read §10 — the v2 direction — because it changes the plan.**

> ⚠️ **DIRECTION SHIFT (read §10 of LINEAGE.md).** The playable pairing UI was built
> and **felt flat** — deliberate parent-selection turned the *fate + story* joy of
> the spin into *management*. A round of population sims found the fix: a **small
> clan (~10–20), the app pairs couples randomly (fate, not admin), litters by
> country TFR, and you fight extinction + inbreeding by spinning fresh blood** —
> which makes the spin the *lifeblood* of breeding. **The product is the story**
> (a child's saga against its real parents). **The next build is NOT more
> mechanics — it's the litter-reveal + saga-copy prototype to prove the stories
> are fun to read.** Everything below ("what's built") still stands; the *direction
> for what's next* is §10.

## What's built (all on `main`)

| Phase | What | Key code |
|---|---|---|
| 0 | Identity: `id`/`parentIds`/`generation`, stored `zFw`, id-keyed dedup, lineage-aware eviction | `App.tsx` (`migrate`, `capLives`, `keep`), `roll.js`, `copy.js` |
| 1 | Eligibility gate: who can found a line, M+F pairing rule | `src/model/lineage.js` (`parentEligibility`, `pairBlock`) |
| 2a | Child genotype draw — mid-parent + **solved** noise so `corr(height,looks)` holds across generations | `src/model/genetics.js` (`makeChildDraw`) |
| 2b | `rollChild` composes a child from two parents; `rollLife` refactored to share `buildLife` | `src/model/roll.js` |
| 2c | Cross-country = single-environment reframe (no conversion module) | `roll.js` (`reframeParentZ`) |
| Destiny | Whole life rolled at once; death age hidden for ordinary lives; "Net worth" is the climax | `Card.tsx`, `LINEAGE.md` §4.0 |
| 5a | Playable pairing UI (select 2 → Start a family → reveal → keep) | `src/ui/MyLives.tsx`, `App.tsx`, `styles.css` |
| 4 | Shadow-family events reconciled (`displayEvents`); marriages recorded (`partnerIds`) | `lineage.js`, `events.js`, `Card.tsx`, `App.tsx` |

## Key model facts (so you don't re-derive)

- **Genes from parents, environment from the child's country.** Child IQ/height
  map through the *child's* country mean/SD (the regression anchor = environment:
  nutrition/schooling). Heritabilities `H` in `genetics.js`: height .80, IQ .50,
  looks .35, famWealth (wealth disposition) .40. **No global anchor, no
  cross-country conversion module** — see LINEAGE.md §4.2/§4.4.
- **Two-channel wealth** (`rollChild`): `parentRank = 0.6·(parents' mean childRank)
  + 0.4·normCdf(heritable zFw)`. Position (nurture) + disposition (nature).
- **`buildLife({country, sex, zFw, zIq, zHt, zLk, parentRank, seed, rng})`** is the
  shared core; founders (`rollLife`) and children (`rollChild`) only differ in how
  the origin is drawn. Keep founders identical → the sim is the guard.
- Bred child carries `generation = max(parents)+1` and `parentIds = [fatherId,
  motherId]`. `partnerIds` is set on both parents at pairing.

## Run & verify

```
npm run sim     # model invariants — MUST stay "ALL CHECKS PASS" (the calibration guard)
npx tsc --noEmit
npm run build
npm run dev     # or the preview tooling
```
- The sim only exercises **founders** (`rollLife`); it does not test `rollChild`.
  For child/lineage logic, write a throwaway node script that imports `makeRoller`
  + `rollChild` (see commit messages for the patterns used). **Delete temp test
  files** — one got committed by accident this session (`git add` specific files,
  not `-A`).
- To test the pairing UI without grinding spins: generate two valid parents via
  the model in node and inject them into the preview's `localStorage['syl.lives']`.

## Gotchas

- **Legacy cards lack `zFw`** (kept before Phase 0). `reframeParentZ` reconstructs
  it from `parentRank`, so new children are finite — but a child *already kept*
  with NaN stats can't be repaired; discard it. Fixed in `roll.js`.
- **Calibration is sacred.** `roll.js` builds `mu/sd/jumpSd/occSorted` from 30k
  random draws and reads `data/luckCdf.json`. Don't change founder behavior without
  re-greening the sim. Bred cards are NOT samples from that CDF (Phase 3 issue).
- **Preview tooling is flaky** on long polled `eval`s (30s cap) and clicking right
  after reload — wait for mount, keep evals short, prefer a screenshot to confirm.
- The reveal `Card` animates via `useReveal`; clicking the card skips to the end.

## Next tasks (priority order — per the §10 v2 direction)

> **Session 2026-06-17 update:** the saga prototype was **shelved** (samples didn't
> land — "not that interesting"; the *writing-is-the-product* thesis is now
> **unproven**, not the locked bet). **Real TFR shipped** (`sim/fetch-tfr.mjs` →
> `countries.json.tfr`) and a **clan-forward "watch it live" sim shipped**
> (`sim/clan.mjs`). The big finding (§10.5): **clans have no natural scale — they
> die (~35% from 10 founders) or boom into the thousands; player curation is the
> only thing that holds clan scale**, and which country the line pools into drives
> its fate (migration becomes central). Lead with §10.5.

0. **(shelved) Saga copy + litter reveal.** Was "THE prototype." A first pass of
   parent-anchored sagas didn't interest the user; revisit later, don't assume the
   writing is the hook. Mechanism for it (extend `copy.json` + `buildBeats`, child
   origin = its *real parents*, `mobilityDelta`/`classOrigin→classFinal` give "rose
   above / repeated / line ended") is still the right approach if resumed.
1. ✅ **Real per-country TFR — DONE.** `sim/fetch-tfr.mjs` (WB `SP.DYN.TFRT.IN`);
   `sim/clan.mjs` runs the clan forward (narrated single run + `--trials N`
   distribution). See LINEAGE.md §10.5 for findings.
2. **Unvalidated next from §10.5:** model the **curation loop** in `clan.mjs`
   (advance best-K kids + real carrying cap → prove it yields the playable hovering
   clan); quantify the **country-pooling die/boom split** and test **migration** as
   the lever that changes a line's fate.
3. **The v2 loop** (§10.2): small clan (~10–20), **app pairs couples randomly**
   (fate, not the current manual selection), litters by TFR, **spin fresh blood**
   vs inbreeding/extinction, curate who advances. Replaces the manual pairing UI.
4. **Inbreeding consequences** (§4.8) — now the *core antagonist* at clan scale.
   Kinship `F` from `parentIds`; F-scaled depression + mortality + tail variance;
   hard-block parent×child & full sibs; warn on close kin. Pass `opts.inbreeding=F`
   to `rollChild`.
5. **`emigrate` relocates descendants** (§4.4/§10) — the earned escape lever; tag a
   character `emigratedTo` and use it as their children's environment country.
6. Deferred: Phase 3 verdict line, lineage/tree view, Phase 6 validation.

NOTE: the current **manual two-parent pairing UI (`MyLives`) is a v1 stepping stone
that the user found flat** — v2 replaces deliberate selection with fate-pairing.
Don't polish the manual selector; build toward §10.

## Open product decisions (the user owns these)

- **Marriage-market scope** (LINEAGE.md §6, still **OPEN**): v1-lite (mate value) vs
  full dowry economy vs fast-follow.
- **Litter size / feel** (#2 above).
- **What replaces the dropped "luckier than X%" line** in the reveal.
- **Tone**: bred children can die young (the birth lottery is cruel by design,
  on-brand per §2) — confirmed acceptable, but a recurring touchpoint.

## How the user works (from memory + this session)

- **Momentum over checkpoints.** Don't stop to ask "go?" between known phases;
  keep building and committing. Only stop for a genuine fork that needs their call.
- **Verify once, then move.** Don't gamble against flaky tooling for rare edge
  cases; a deterministic check or code-reasoning is enough. On commit/push/merge,
  just do it.
- **Branch, don't commit to `main`.** Feature branch → `--no-ff` merge → push.
  Conventional-commit messages ending with the Co-Authored-By trailer.
- The user is **deeply hands-on about reveal/UX/voice and the model** — they
  redirected death-age display, net-worth framing, country-genetics, and the
  Destiny model. Surface UX/voice/model-shape choices; default the plumbing.
- **Voice (LINEAGE.md §2):** plain family register, deadpan not warm; "lineage" =
  structure, "dynasty" = the doomed chase, "bloodline" never.
