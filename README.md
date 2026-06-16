# spin-life

A "birth lottery" game (clone + extension of spinyour.life). Spin to be born into a random
real-world life, weighted by real demographic data — with a social-mobility layer that turns
each roll into a life story.

- **[DESIGN.md](DESIGN.md)** — full design doc, calibrated math model, open decisions.
- `data/countries.json` — 241-country dataset (births, net worth, Gini, height, IQ, life exp).
- `data/model-params.json` — calibrated trait-model parameters.
- `sim/simulate.mjs` — simulation harness that validates the model against target correlations.

## Run the model sim

```bash
node sim/simulate.mjs 200000
```

No app yet — stack/scope are open decisions (see DESIGN.md §6).
