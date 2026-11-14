#!/usr/bin/env bash
# record_cycles.sh: run the official-size equivalence tests for several PE counts and record the
# "Computation took N clock cycles" line from each, so collect_cycles.py can compare them with the
# cycle model  cycles = ceil(rows / (P * lanes)) * (cols + 3) + 8.
#
# usage: EQ_SCRIPT=/path/to/proto_eq.sh  record_cycles.sh <verilog_dir> <runs_dir> <tag> <sim> "P list" ["MODE list"]
#   verilog_dir  a directory holding logical/ (your unoptimized_verilog, or a copy of it)
#   runs_dir     where run folders and <tag>/summary.txt go (keep it outside the repo)
#   sim          icarus (use this for pass/fail) or verilator (faster, but its pass/fail is not
#                reliable with array.sv; see the page's "Cycle model" tab)
# EQ_SCRIPT must take: <verilog_dir> <INT8|INT16|INT32> <rows> <cols> <outdir> <sim>, read PE_COUNT
# from the environment, print the testbench's "took N clock cycles" line and EQUIVALENT/MISMATCH.
# The prototype used to record data/cycles.json was the session's proto_eq.sh; the repo's `make eq`
# is the polished version of the same recipe.
set -uo pipefail
D="$1"; RUNS="$2"; TAG="$3"; SIM="$4"; PS="$5"; MS="${6:-INT8 INT16 INT32}"
EQ="${EQ_SCRIPT:?set EQ_SCRIPT to an equivalence-test script (see the header)}"
mkdir -p "$RUNS/$TAG"
for P in $PS; do
  for MODE in $MS; do
    case "$MODE" in INT8) R=1024;; INT16) R=512;; INT32) R=256;; *) echo "bad mode $MODE"; exit 1;; esac
    OUT="$RUNS/$TAG/P${P}_${MODE}"
    mkdir -p "$OUT"
    t0=$(date +%s)
    PE_COUNT=$P "$EQ" "$D" "$MODE" $R $R "$OUT" "$SIM" > "$OUT.log" 2>&1
    rc=$?
    t1=$(date +%s)
    LINES=$(wc -l < "$OUT/mat_mul.asm" | tr -d ' ')
    IB=$(wc -l < "$OUT/inst.bits" | tr -d ' ')
    DEPTH=$(grep -E '^`define IMEM_DEPTH' "$OUT/defines.sv" | awk '{print $3}')
    CYC=$(grep -oE 'took [0-9]+ clock' "$OUT.log" | awk '{print $2}')
    EQV=$(grep -oE '^(EQUIVALENT|MISMATCH)' "$OUT.log" | head -1)
    echo "tag=$TAG P=$P mode=$MODE rows=$R cols=$R asm_lines=$LINES inst_bits_lines=$IB imem_depth=$DEPTH cycles=${CYC:-NA} result=${EQV:-FAIL} rc=$rc secs=$((t1-t0)) sim=$SIM" | tee -a "$RUNS/$TAG/summary.txt"
    # the generated memory images are hundreds of MB at large P; delete them by name from inside the run folder
    ( cd "$OUT" && rm -f mem0.bits mem1.bits out.bits result.bits matrix.npy vector.npy simv.vvp && rm -rf obj_dir )
  done
done
