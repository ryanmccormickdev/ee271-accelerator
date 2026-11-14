# Part 3 experiment log

One row per synthesis run we might cite. FoM = (T8 + T16 + T32)^2.3 × Area(µm²) × Power(mW) × 1e-15, with
T = cycles × clock period (ns). Lower is better. A row only counts if the equivalence tests pass (VCS, or at least
`make eq` + `make eq-stress`) **and** worst slack ≥ 0 at that period, and area ≤ 1,000,000 µm².

**% improvement** (the report asks for it) is always `(FoM_before − FoM_after) / FoM_before × 100`, against the
previous best (and also against the baseline, in the last column). `make fom RUN=runs/<tag> BASE=runs/<before>`
prints both numbers.

How to add a row: `make synth PERIOD=... PE_COUNT=... RTL=optimized_verilog TAG=<short-name>` on caddy, then
`make fom RUN=runs/<tag> BASE=runs/<previous best>`, and commit `runs/<tag>/` with this file.

| # | Date | Who | Tag (runs/) | Commit | Change | PEs | Period (ns) | Cycles 8/16/32 | Area (µm²) | Power (mW) | Worst slack | FoM | % vs prev best | % vs baseline |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | | | baseline | | Part 2 design as submitted | 16 | 2.0 | 16440/8248/4152 | | | | | — | — |

Notes per experiment (what we expected, what happened, why). Paste the paragraph into `docs/part3-report.md` too:

- **#0 baseline:** ...
