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
build checklist (what's done vs next).

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

## Next tasks (priority order)

1. **Inbreeding consequences** — *designed in LINEAGE.md §4.8, user said build it.*
   Kinship `F` from `parentIds` (parent×child/full-sib 0.25, half/uncle/grandparent
   0.125, cousins 0.0625); F-scaled mean depression on fitness traits + elevated
   mortality + **tail variance** (the Charles II); **hard-block parent×child & full
   sibs** in `pairBlock`; "closely related" warning in the pairing bar. Compute F in
   the UI layer (has the `lives` graph), pass `opts.inbreeding = F` to `rollChild`.
2. **Litter** — a pairing makes ONE child today; LINEAGE.md wants a family of N
   (independent draws). Needs a product call on count/feel.
3. **Phase 3 — verdict trajectory** — drop the vestigial "luckier than X% of births"
   line (still in `Card.tsx` head); the *replacement* is a UX call (the tier name +
   rarity already carry the verdict). Dynasty net-worth trajectory + anti-compounding
   damping need a dynasty/tree surface to be meaningful.
4. **Lineage / tree view** — see a card's ancestry & descendants; surface
   `generation`/`parentIds`/`partnerIds` which are stored but unshown.
5. **Phase 6 validation** — fold bred-generation invariants into the sim.

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
