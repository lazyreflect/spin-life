# spin-life

A "birth lottery" game (clone + extension of spinyour.life). Spin to be born into a random
real-world life, weighted by real demographic data — with a social-mobility layer that turns
each roll into a life story.

**Live (phone-friendly): https://lazyreflect.github.io/spin-life/** — auto-deploys on push to `main`.

Stack: Vite + React + TypeScript, client-only (no backend), state in localStorage.

- **[DESIGN.md](DESIGN.md)** — full design doc, calibrated math model, open decisions.
- `data/countries.json` — 241-country dataset (births, net worth, Gini, height, IQ, life exp).
- `data/model-params.json` — calibrated trait-model parameters.
- `data/names.json` — 36 culture-cluster name lists. `data/careers.json` — career catalog.
- `sim/simulate.mjs` — validates the model against target correlations.
- `sim/cards.js` — prints sample life-cards using the shared model.
- `src/model/*.js` — the model, shared by the sim and the app.

## Commands

```bash
npm install
npm run dev      # local dev server
npm run build    # production build -> dist/
npm run sim      # validate trait-model correlations
npm run cards    # print sample life-cards
```
