## What this changes

<!-- one or two lines -->

## Explain it (the oral-exam version)

<!-- 3-6 sentences in your own words, as you'd say it to an examiner: what the hardware does, cycle by cycle if timing
is involved, and why you chose this over the alternative. The reviewer reads this, then explains it back to you
without notes before approving (teach-back rule, docs/PLAN.md). -->

## Checks

- [ ] `make check` passes (lint, pe-unit, ctl-check, buf-unit, eq)
- [ ] `make eq-stress` passes (before merging anything that touches timing or arithmetic)
- [ ] Part 3 only: `make synth` record in `runs/<tag>/`, a row in `docs/experiments.md`, a paragraph in `docs/part3-report.md`
- [ ] New decision? A line in `docs/decisions.md`. Used AI? A line in `docs/ai-log.md`.
- [ ] Reviewer did the teach-back
