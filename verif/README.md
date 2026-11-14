# Our own checks for the Part 2/3 RTL

Each module gets a check that runs it **alone**, so the PE, the controller and the buffer can be written in parallel.
Each check compares against the staff's Python reference (`part2/simulator/src`). They assume the timing contract in
`docs/PLAN.md`, but they *measure* latency instead of hard-coding it, and report what they find.

| Check | Runs | Against | Command |
|---|---|---|---|
| `pe_unit/` | `processing_element.sv` driven directly, 1,753 steps | the staff Python PE: directed edge cases (clamp limits, RND ties and big shifts, PASS sign extension, valid low, mode switches) plus random | `make pe-unit` (`ACC=acc` also checks the accumulator by name) |
| `ctl_check/` | staff `top_controller` wrapper = given `instruction_memory` + our `controller.sv` | each program expanded into its repetitions: order, offsets, PE instruction, lag, bubbles | `make ctl-check` |
| `buf_unit/` | `buffer.sv` driven directly (4 PEs) | the staff Python main buffer: 204 READs in all modes/lanes, 53 WRITEs, valid low | `make buf-unit` |

How they were validated (2026-11-14): each passes on a throwaway reference design under both Icarus and Verilator. Each
also fails, with a message naming the bug, on deliberately broken copies: OUT truncating instead of clamping, a WRITE
committed a cycle early, lane select with the live mode, a controller with bubbles or with Count instead of Count+1.

The end-to-end equivalence tests (`make eq`, `make eq-stress`) live in `scripts/rtl/eq.sh`, and their mismatch
decoder is `scripts/rtl/mem2diff.py`.
