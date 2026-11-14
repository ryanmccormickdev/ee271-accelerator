# Design decisions

One entry per non-obvious choice: what we chose, what else we considered, and why. This is the file to reread the
night before the oral exam ("why did you do it this way?" is the most common examiner question). Newest last.

Template:

```
## YYYY-MM-DD: <decision in one line> (who)
- Chose: ...
- Alternatives: ...
- Why: ...
- Evidence: <test, waveform, synthesis run (runs/<tag>), or spec/Ed reference>
```

---

## 2026-11-14: adopt the 1-cycle timing contract in docs/PLAN.md (proposed, to confirm in pair session #1)
- Chose: memory instruction in cycle t, its PE instruction in t+1 (delayed copy in the controller), MEM1 lane select from
  the offset/mode registered at t, WRITE committed at the end of t+1, one repetition per cycle with no bubbles.
- Alternatives: register the SRAM outputs (2-cycle read latency: PE at t+2, WRITE at t+2); delay the WRITE in the
  controller instead of the buffer; a simpler controller with an idle cycle between instructions.
- Why: smallest design that meets the SRAM's 1-cycle read latency and the OUT→WRITE dependency; zero bubbles because
  cycles enter the Part 3 FoM with exponent 2.3.
- Evidence: the local checks (make ctl-check / buf-unit / pe-unit / eq) encode this contract and report deviations.
