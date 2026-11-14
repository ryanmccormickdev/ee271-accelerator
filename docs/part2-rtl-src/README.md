# Sources for `docs/part2-rtl.html`

"From the Python model to RTL": the Part 2 explainer. One self-contained HTML file built from these pieces.
Edit here, then rebuild.

| File | What it is |
|---|---|
| `body.html` | page structure and all the fixed teaching text (nine tabs) |
| `rtl.css` | styles added to `docs/walkthrough-src/style.css` (the shared tokens, light and dark) |
| `model.js` | small models behind the widgets: instruction decoding, the PE arithmetic, RND, the MEM1 decoder, and the cycle schedule |
| `app.js` | the tabs: hierarchy diagram, waveform viewer, PE lab, decoder explorer, schedule, slices, mismatch decoder, quizzes |
| `regions.py` | the "Read the code" tab: the given Part 2 files split into blocks, with a note per block |
| `build.py` | stitches it all into `docs/part2-rtl.html`, pasting the real files from `part2/` into the code reader |
| `waves.json` | the recorded waveforms (made by `vcd2json.py`) |
| `facts.json` | the measured numbers: cycle counts, MEM2 mismatches, data statistics, testbench values (made by `collect_facts.py`) |
| `defines_p16.sv` | `ivd-gv`'s `defines.sv` with default options, used by the code reader when the Part 2 env is missing |
| `record.sh`, `record_tb.sh` | run any RTL folder through the staff flow (equivalence or module testbench) with Verilator or Icarus |
| `vcd2json.py`, `collect_facts.py` | turn those runs into `waves.json` and `facts.json` |
| `test_model.js` | checks `model.js` against the recordings, the testbench facts, exact rounding and Icarus |

```sh
python3 docs/part2-rtl-src/build.py      # rebuild the page from the checked-in data (or: make docs)
node docs/part2-rtl-src/test_model.js    # re-check the models (needs Node; uses iverilog if installed)
```

`build.py` fails loudly if a block's first line (in `regions.py`) has moved or disappeared from the staff
files, or if placeholder text is left in the page. With the Part 2 conda environment present it also
regenerates `defines.sv` with the staff's `ivd-gv`.

## Where the data comes from

Every waveform and number on the page comes from simulations of a **throwaway reference design**, kept in
the session's scratch space and deliberately **not** in this repo (it would be a solution), plus copies of it
with one deliberate bug each (the page describes each change in words). The recording steps:

```sh
# the 6x3 worked example on 2 PEs, with a VCD (one run per design)
VFLAGS=-fno-inline docs/part2-rtl-src/record.sh <design>/unoptimized_verilog <scratch>/rec/ref example
python3 docs/part2-rtl-src/vcd2json.py ref=<scratch>/rec/ref bubble=<scratch>/rec/bubble ...   # writes waves.json
# official sizes, no VCD; folders named ni_<design>_<test>[_v7], icarus_<design>_<test>, p<P>_ref_<test>, tb_<tb>_<sim>
VFLAGS=-fno-inline docs/part2-rtl-src/record.sh <design>/unoptimized_verilog <scratch>/runs/ni_ref_int8 int8
part2/ee271-conda-env/bin/python docs/part2-rtl-src/collect_facts.py <scratch>/runs                   # writes facts.json
```

`-fno-inline` matters: with default flags Verilator races on the given instruction memory and skips the
first instruction of every program (explained on the page, Verify tab). With it, Verilator agrees with Icarus
on every recorded signal in every cycle.

## Compare your own design with the page

`record.sh` takes any folder laid out like `part2/unoptimized_verilog`, so you can record your RTL on the
same worked example and line it up with the Cycles tab:

```sh
VFLAGS=-fno-inline docs/part2-rtl-src/record.sh part2/unoptimized_verilog build/rtl-example example
surfer build/rtl-example/waves.vcd
```

**Heads-up:** the Cycles tab, `waves.json` and `model.js`'s `schedule()` show one complete, working timing
for the machine. That's effectively a reference answer for the timing. If you want to derive it yourself,
read the Main buffer and Controller tabs first and use the "hide answers" mode of the schedule.
