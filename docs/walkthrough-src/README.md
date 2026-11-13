# Sources for `docs/walkthrough.html`

The walkthrough is one self-contained HTML file built from these pieces. Edit here, then rebuild.

| File | What it is |
|---|---|
| `body.html` | page structure and all the fixed teaching text |
| `style.css` | styles (light and dark) |
| `model.js` | a small JavaScript model of the accelerator that drives every animation and playground |
| `app.js` | the six tabs: big picture, worked example, PE, main buffer, controller, read the code |
| `regions.py` | the "Read the code" tab's content: every starter file split into blocks, with a note per block |
| `trace_values.py` | runs the given starter code on the 6×3 example and records what its variables hold at chosen lines (`values.json`) |
| `build.py` | stitches it all into `docs/walkthrough.html`, pasting the real files from `part1/` into the code reader |
| `dump_fixtures.py`, `test_model.js` | check `model.js` against the starter's own compiler/assembler and every public test |

```sh
make walkthrough         # rebuild docs/walkthrough.html (do this after `make update-starter`, so the code map stays current)
make walkthrough-check   # needs Node: re-verify model.js against the starter code and the public tests
```

`build.py` fails loudly if a block's first line (in `regions.py`) has moved or disappeared, and
`trace_values.py` fails if a probed line is gone, so a staff change to the starter can't silently
put a note next to the wrong code. The values are only ever recorded from the *given* files;
nothing here runs the three files you write.

**Heads-up:** `model.js` is a working model of the hardware in JavaScript, so it is effectively a
reference answer in another language. If you want to write the Python from a blank page, don't
read it first.
