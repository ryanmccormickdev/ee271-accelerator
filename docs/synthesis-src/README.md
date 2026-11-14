# Sources for `docs/synthesis.html`

"From RTL to gates": what Design Compiler does to the Part 2 design, the course `synth/` script line by line,
real Yosys runs on small examples, and how to read DC's reports. One self-contained HTML file, built from these pieces.

| File | What it is |
|---|---|
| `body.html` | page structure and all the fixed teaching text; `{{...}}` placeholders are filled from the recorded data |
| `style.css` | styles; lines 1–28 are the walkthrough's colour tokens, copied verbatim (build.py warns if they drift) |
| `app.js` | tabs, the flow stepper, the clickable script reader, the Yosys explorer and charts, the PE ballpark, the paste tools |
| `parser.js` | tolerant parsers for report_timing / report_area / report_power / report_qor / results.txt / compile.log |
| `annotations.js` | what each line of the illustrative reports means (the "Reading reports" tab) |
| `script_notes.py` | the notes for every block of `part2/unoptimized_verilog/synth/{Makefile,dc_synth.tcl}` |
| `examples/*.sv` | the small RTL examples synthesized with Yosys (plus a two-cell latch techmap) |
| `run_yosys.py` → `yosys_results.json` | runs Yosys on every example and records cells, areas and ABC critical paths |
| `lib_facts.py` → `lib_facts.json` | reads areas, leakage, pin caps, delays, setup/hold, FO4, logical effort and the wire-load table out of the Liberty file |
| `make_samples.py` → `samples/*.txt`, `samples/expected.json` | the ILLUSTRATIVE DC-format reports (invented numbers that add up) |
| `test_parser.js` | checks `parser.js` against the samples and messy variants |
| `build.py` | stitches everything into `docs/synthesis.html`, pasting the real synth files from `part2/` |

```sh
python3 docs/synthesis-src/build.py            # rebuild the page from the checked-in data (stdlib only)
node docs/synthesis-src/test_parser.js         # re-check the report parser (needs Node)

# only to refresh the recorded data:
LIB=/path/to/NangateOpenCellLibrary_typical.lib
python3 docs/synthesis-src/lib_facts.py $LIB
python3 docs/synthesis-src/run_yosys.py --lib $LIB      # needs yosys on PATH and the Part 2 conda env (for ivd-gv)
python3 docs/synthesis-src/make_samples.py
```

`build.py` fails if a script block's first line (in `script_notes.py`) has moved, if an `examples/` file changed
since `yosys_results.json` was recorded, or if a placeholder names data that doesn't exist.

**The Liberty file** is the open-source Nangate 45 nm typical-corner library, byte-identical to
`flow/platforms/nangate45/lib/NangateOpenCellLibrary_typical.lib` in OpenROAD-flow-scripts
(sha256 `8d540a4d4cf6d09d27c87ad067857a9c0c2eeb023ab7a56e058cd3113db4e9b1`). The course ships only the compiled `.db`.
The two have the same 134 standard cells (checked against `synth/lib/NangateOpenCellLibrary/CEL/`).

**Evidence labels.** Numbers from Yosys or the .lib are labeled "Yosys + open Nangate45, not DC" on the page.
DC behavior is labeled "DC docs" and the DC-format reports are labeled "illustrative": nobody has run DC on this design yet.

**Heads-up:** the "Use example counts" button in the FoM calculator fills in cycle counts measured on one
zero-bubble reference design (16,440 / 8,248 / 4,152 cycles at 16 PEs). That's effectively a reference answer for
the cycle timing. Nothing else on the page comes from that design, and no accelerator module appears anywhere.
