# Sources for `docs/part3-ppa.html`

The Part 3 page is one self-contained HTML file built from these pieces. Edit here, then rebuild.

| File | What it is |
|---|---|
| `body.html` | page structure and all the fixed teaching text |
| `style.css` | styles; the first block is copied from `docs/walkthrough-src/style.css` (same tokens, light and dark) |
| `lib.js` | the arithmetic, with no DOM: FoM, the cycle model, the `results.txt` parser, the multiplier-sharing math |
| `app.js` | tabs, charts, the calculator, the bit-level multiplier demo |
| `data/cycles.json` | measured cycle counts (written by `collect_cycles.py`) |
| `data/blocks.json` | building-block areas from Yosys (written by `record_blocks.py`) |
| `blocks/*.v` | the generic blocks Yosys synthesizes (multipliers, adders, registers, a mux; no PE, no student module) |
| `record_cycles.sh` | runs the official-size equivalence tests for a list of PE counts and appends one summary line per run |
| `collect_cycles.py` | turns those summary lines into `data/cycles.json`, and fails if any count disagrees with the model |
| `record_blocks.py` | re-synthesizes `blocks/*.v` with Yosys and the open Nangate45 Liberty |
| `test_lib.js` | checks `lib.js` against `data/cycles.json`, exact BigInt products and the parser sample |
| `build.py` | stitches it all into `docs/part3-ppa.html` (stdlib only) |

```sh
python3 docs/part3-ppa-src/build.py        # rebuild the page from the checked-in JSON (no tools needed)
node docs/part3-ppa-src/test_lib.js        # re-verify the arithmetic (needs Node)
```

Re-recording the data is optional; the page rebuilds without it.

```sh
# cycle counts: needs an equivalence script with proto_eq.sh's interface
# (<verilog_dir> <MODE> <rows> <cols> <outdir> <sim>, PE_COUNT in the environment).
EQ_SCRIPT=/path/to/proto_eq.sh docs/part3-ppa-src/record_cycles.sh <verilog_dir> <runs_dir> icarus2 icarus "5 6 8 16 24 43 64 86 128"
python3 docs/part3-ppa-src/collect_cycles.py <runs_dir>

# building blocks: needs yosys (tested with 0.68) and the open Nangate45 Liberty
python3 docs/part3-ppa-src/record_blocks.py --lib /path/to/NangateOpenCellLibrary_typical.lib
```

Run `record_cycles.sh` on your own design once it works: `collect_cycles.py` stops with a message
if any measured count differs from `ceil(rows / (P × lanes)) × (cols + 3) + 8`, so it doubles as a
check that your design has no bubbles. The recorded data came from a throwaway zero-bubble reference
design that lives only in a scratch folder. It is not in the repo and never will be.
`collect_cycles.py` reads these subfolders of `<runs_dir>`:

- `icarus2` and `ver2`: the official sweep in Icarus and in Verilator (`-O2 -fno-inline`)
- `bubble_icarus2`, `tworep_icarus2`, `bubble_v2`, `tworep_v2`: the two slowed controller variants
- `odd2`: four non-official sizes
- `trunc/P6.log`, `trunc/P8.log`: the instruction-memory truncation demo

The variants and the truncation demo were made with scratch scripts that modify the reference
design, so only the JSON is kept here.

**Labels.** Numbers on the page carry one of three labels. *Measured* means a real local run.
*Yosys estimate* means Yosys + open Nangate45, not Design Compiler. *Illustrative* means invented
to show a format (the DC lines in the calculator's sample, the timing-report excerpt).
Nobody had run Design Compiler on this design when the page was written.
