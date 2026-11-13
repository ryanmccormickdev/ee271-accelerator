# AI use log

The final report (due Dec 1) needs a **one-page reflection on our AI use**: what worked and what
didn't (Ed #207). The oral quiz checks that we can explain everything, AI-assisted or not.
Add a short entry whenever an AI tool does something real, so the reflection writes itself.

Template:

```
## YYYY-MM-DD: who, which tool
- Asked for: ...
- Got: ...
- Worked / didn't: ...
- What we checked or changed ourselves: ...
```

---

## 2026-11-08: Ryan, Claude Code (Claude Opus 5.5)
- Asked for: set up a shareable project repo and dev environment for part 1, plus an orientation tutorial.
- Got: this repo layout, the Makefile shortcuts and scripts, the VS Code config, `playground/tour.py`
  (a readable walkthrough that only uses the starter's compiler and assembler), `docs/tutorial.html`,
  and the spec checklist in `docs/spec-notes.md`.
- Not done by AI: no code in `src/processing_element.py`, `src/main_buffer.py` or `src/accelerator.py`. Those are ours.
- Worked / didn't: (fill in after using it)

## 2026-11-09: Ryan, Claude Code (Claude Opus 5.5)
- Asked for: an animated, data-level walkthrough of the whole accelerator: what goes in at test scale, whether anything
  external is involved, and each component down to what part 1's code needs, plus a map from the starter code to the animation.
- Got: `docs/walkthrough.html`, built from `docs/walkthrough-src/`. It runs on a JavaScript model of the accelerator,
  which was checked against every public test and against the starter compiler's and assembler's real output. Also
  updated `docs/spec-notes.md` with the staff answer on Ed #221 (repetition order) and two gaps in the public tests.
- Not done by AI: still no code in the three `src` files. Note that `walkthrough-src/model.js` is a working model in
  JavaScript, so it's effectively a reference answer in another language.
- Worked / didn't: (fill in after using it)

## 2026-11-09 (later): Ryan, Claude Code (Claude Opus 5.5)
- Asked for: the code itself, highlighted block by block, with the matching explanation side by side, because mapping
  the concepts to this style of Python was the weak spot.
- Got: the walkthrough's "Read the code" tab. It shows all 9 starter files in 136 blocks, each with a note: what the
  block does, the handout passage or worked-example step it implements, real variable values recorded by running the
  given starter code (`trace_values.py`), and notes on reading the Python. There's also a call map of one test run and a
  Python primer.
- Not done by AI: still no code in the three `src` files. The notes for those say what the code must do, not the code.
- Worked / didn't: (fill in after using it)
