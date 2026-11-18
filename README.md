# EE271 project: SIMD matrix-multiply accelerator

Our team repo for the EE271 (Fall 2026) course project. It holds all parts in one place:

| Part | What | Due | Folder |
|---|---|---|---|
| 1 | Python simulator of the accelerator | Fri Nov 13 (submitted) | `part1/` |
| 2 | SystemVerilog RTL + equivalence tests + synthesis | **Thu Nov 19, 11:59 PM** (revised handout + Ed). A late day from each of us moves it to Fri | `part2/unoptimized_verilog/` |
| 3 | Optimize power/performance/area (a figure of merit) + report | **Tue Dec 1, 11:59 PM** (revised handout). 93% of the credit needs FoM < 50 and area < 1,000,000 µm². No late days | `part2/optimized_verilog/` (made after Part 2) |
| 4 | HLS version (Siemens Catapult), optional, +5% of the project component | **Tue Dec 1** (handout); no late days; only if Part 3 is in hand | `part4/` |
| — | **Oral exam**: 15 min, 25% of the course grade | **Thu Dec 3** | `docs/oral-prep.html` |

**Start with [`docs/PLAN.md`](docs/PLAN.md)**: the Part 2 design and timing contract, who does what, the calendar,
and why the split is built around the oral exam.

## Explainers (open in a browser, e.g. `open docs/part2-rtl.html`)

| Page | What |
|---|---|
| [`docs/walkthrough.html`](docs/walkthrough.html) | Part 1: the machine, animated, with every starter file block by block |
| [`docs/part2-rtl.html`](docs/part2-rtl.html) | Part 2: from the Python model to cycle-accurate SystemVerilog: timing, each module, traps, debugging |
| [`docs/synthesis.html`](docs/synthesis.html) | From RTL to gates: what Design Compiler does with our design, and how to read its reports |
| [`docs/part3-ppa.html`](docs/part3-ppa.html) | Part 3: the figure of merit, the cycle model, every optimization, an FoM calculator |
| [`docs/oral-prep.html`](docs/oral-prep.html) | Oral-exam drills and a 15-minute mock exam for two, from the question banks in `docs/oral-prep/` |
| [`docs/tutorial.html`](docs/tutorial.html) | Part 1 orientation: setup, the code, the bit-level ideas |

## Quick start (each partner, once per computer)

Needs `git`, `make` and conda (`make setup` explains how to install it if missing). For Part 2 on a laptop also
`brew install icarus-verilog verilator surfer` (Icarus is the default simulator, Verilator does lint, Surfer shows waveforms).

```sh
git clone https://github.com/ryanmccormickdev/ee271-accelerator.git ee271-project
cd ee271-project
make setup                 # Part 1's environment
make setup PART=part2      # Part 2's (pins bitstring<5: the staff tools break on bitstring 5)
make test                  # Part 1's public tests
make check                 # Part 2: lint + per-module checks + equivalence tests (fails until the RTL is written)
```

## Everyday commands

| Command | What it does |
|---|---|
| `make check` | Part 2/3 local gate: lint → `pe-unit` → `ctl-check` → `buf-unit` → `eq`. Run it before every push |
| `make eq` (`MODE=int8`, `WAVES=1`) | the official equivalence tests, locally, in seconds; explains mismatches |
| `make eq-stress` / `make eq-both` | tests the official ones miss / Icarus vs Verilator cross-check |
| `make pe-unit` / `ctl-check` / `buf-unit` | one module alone against the staff's Python reference |
| `make tb TB=pe`, `make waves` | a staff validation testbench, then its waveform in Surfer |
| `make vcs-eq`, `make synth`, `make fom` | on caddy: the graded VCS tests, Design Compiler, the Part 3 figure of merit |
| `make submit PART=part2` | checks `compile.log` and the tests, then builds `part2/assignment2.zip` |
| `make help` | everything, with the knobs (`RTL=`, `PE_COUNT=`, `SIM=`, `PERIOD=`) |
| `make test`, `make tour`, `make repl` | Part 1 |
| `make update-starter PART=part2` | pull staff fixes to the starter (commit your work first) |

## Layout

```
ee271-project/
├── part1/                  Part 1 starter + our Python (submitted)
├── part2/                  the staff's Part 2 starter (code.stanford.edu/EE271/simd-part2), unchanged layout
│   ├── unoptimized_verilog/logical/   ← our RTL: processing_element.sv, buffer.sv, controller.sv, top.sv
│   ├── unoptimized_verilog/validation  staff per-module testbenches (VCS)
│   ├── unoptimized_verilog/synth       Design Compiler script + Nangate 45 nm library
│   ├── equivalence_testing/           the graded int8/int16/int32 tests (VCS)
│   └── simulator/                     staff reference Python + the ivd-* tools
├── part4/                  the staff's optional Part 4 starter (simd-part4): Catapult HLS, runs on FarmShare
├── verif/                  our per-module checks (PE, controller, buffer) against the staff Python
├── scripts/rtl/            the local Icarus/Verilator flow and the caddy wrappers;  scripts/fom.py
├── runs/                   Design Compiler run records we cite (committed)
├── handouts/               assignment PDFs (+ text copies of Parts 2 and 3 for grep; Part 4's is part4/README.md)
├── docs/                   PLAN, WORKFLOW, spec-notes, decisions, experiments, part3-report, ai-log, explainers
├── playground/tour.py      Part 1 mini-debugger
└── Makefile                the shortcuts above
```

`part1/`, `part2/` and `part4/` keep exactly the staff's folder layout, so every command in the handouts still works there
(e.g. on caddy: `cd part2/equivalence_testing && make int8_test`).

## Rules we're working under

- **Partners:** one Gradescope submission per pair, partner added (Ed #234).
- **AI is allowed** on any part of the project (Prof. Tambe, Ed #207), but we must be able to explain every line in the
  oral exam, and the final report needs a one-page reflection. Log as you go in `docs/ai-log.md`.
- **Keep this repo private.** The honor code forbids letting other students see or copy our code.

## Sharing this repo

It lives at https://github.com/ryanmccormickdev/ee271-accelerator (**private**). To give the partner access (Ryan,
as the owner):

```sh
scripts/share-on-github.sh <partner-github-username>
```

It pushes `main`, stops if the repo isn't private, and sends a GitHub invite (accept it from GitHub's email or
notifications). Then see `docs/WORKFLOW.md`.
