# EE271 project: SIMD matrix-multiply accelerator

Our team repo for the EE271 (Fall 2026) course project. It holds all parts in one place:

| Part | What | Due | Folder |
|---|---|---|---|
| 1 | Python simulator of the accelerator | **Fri Nov 13, 11:59 PM** (no extensions) | `part1/` |
| 2 | SystemVerilog RTL + synthesis (needs a working part 1) | Thu Nov 19 | `part2/` (import when released) |
| 3 | Optimize power/performance/area | Tue Dec 1 | later |
| — | Report with a one-page AI reflection; 15-min oral quiz | Dec 1 / Dec 3 | `docs/ai-log.md` |

**New here? Open [`docs/tutorial.html`](docs/tutorial.html) in a browser** (`open docs/tutorial.html`).
It walks through the setup, the code, and the bit-level ideas you'll need.

## Quick start (each partner, once per computer)

Needs `git`, `make` and conda. Any of Miniforge, Miniconda or Anaconda works; `make setup`
explains how to install one if it's missing. Works on macOS and Linux; on Windows, use WSL.

```sh
git clone <our private GitHub URL> ee271-project
cd ee271-project
make setup        # builds part1/ee271-conda-env from part1/requirements.yml (the course's pinned versions)
make test         # runs the public tests
```

## Everyday commands

| Command | What it does |
|---|---|
| `make test` | all public tests for part 1 (`make test-pe`, `make test-buffer`, `make test-accel` for one file) |
| `make tour` | prints a tiny matrix-vector multiply: memory contents, the program, expected result, and what *our* code produced. `make tour ARGS="--mode INT8 --trace"` |
| `make repl` | Python prompt with `Bits` and the instruction classes loaded, for experiments |
| `make submit` | builds `part1/assignment1.zip` for Gradescope |
| `make update-starter` | pulls staff fixes to the starter code (commit your work first) |

Everything defaults to part 1. For later parts add `PART=part2`, e.g. `make test PART=part2`.

## Layout

```
ee271-project/
├── part1/                 the course starter (code.stanford.edu/EE271/simd-part1), unchanged layout
│   ├── src/               ← our code goes in processing_element.py, main_buffer.py, accelerator.py
│   ├── test/              public tests (+ the course's own Makefile)
│   └── requirements.yml   the course's conda environment spec
├── handouts/              assignment PDFs from Canvas
├── playground/tour.py     readable walkthrough / mini-debugger (not submitted)
├── docs/
│   ├── tutorial.html      orientation tutorial
│   ├── WORKFLOW.md        how we work together in git
│   ├── spec-notes.md      spec checklist + clarifications from Ed/staff
│   └── ai-log.md          running log for the required AI reflection
├── scripts/               setup / starter-update / GitHub-sharing helpers
└── Makefile               the shortcuts above
```

`part1/` keeps exactly the staff's folder layout, so every command in the handout and on Ed
still works there: `cd part1/test && make run_tests` with the environment activated.

## Rules we're working under

- **Partners:** the project is done in pairs, and a pair submits once on Gradescope (add your partner to the submission).
- **AI is allowed** on any part of the project (Prof. Tambe, Ed #207). We must be able to explain every line
  in the oral quiz, and the final report needs a one-page reflection. Log as you go in `docs/ai-log.md`.
- **Keep this repo private.** The honor code forbids letting other students see or copy our code.
- **Farmshare/caddy are down** right now (Ed #219). Part 1 is pure Python, and staff say to do it locally.

## Sharing this repo (one time, by whoever owns it)

```sh
scripts/share-on-github.sh <partner-github-username>
```

This creates a **private** GitHub repo, pushes, and invites the partner. Then see `docs/WORKFLOW.md`.
