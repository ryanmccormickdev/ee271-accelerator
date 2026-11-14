#!/usr/bin/env bash
# Lint the RTL with Verilator: catches width mismatches, latches, undriven signals, multiple drivers, blocking
# assignments in clocked blocks, ... before you spend a caddy session on VCS or Design Compiler.
#
#   scripts/rtl/lint.sh            our four files (warnings from the staff's given files are counted but not shown)
#   ALL=1 scripts/rtl/lint.sh      show every warning, staff files included
set -euo pipefail
. "$(dirname "$0")/common.sh"
need_tool verilator "Install it with: brew install verilator"

OUT="$BUILD/lint/$RTL_NAME-p$PE_COUNT"; mkdir -p "$OUT"
ivd gv --out "$OUT/defines.sv" --pe_count "$PE_COUNT"
FILES="$OUT/defines.sv"
for f in array instruction_memory controller buffer processing_element top; do FILES="$FILES $LOGICAL/$f.sv"; done
# any extra modules we add (e.g. a multiplier in Part 3) are found through -y
# shellcheck disable=SC2086
verilator --lint-only -Wall -Wno-fatal -Wno-DECLFILENAME -Wno-EOFNEWLINE --top-module top \
  -I"$OUT" -I"$LOGICAL" -y "$LOGICAL" +libext+.sv $FILES > "$OUT/lint.log" 2>&1 || true

ERRS=$(grep -c '^%Error' "$OUT/lint.log" || true)
OURS='(controller|buffer|processing_element|top)\.sv'
if [ "${ALL:-0}" = 1 ]; then
  grep -E '^%(Error|Warning)' "$OUT/lint.log" | sed "s|$REPO/||" || true
else
  grep -E '^%(Error|Warning)' "$OUT/lint.log" | grep -E "$OURS|^%Error" | sed "s|$REPO/||" || true
fi
TOTAL=$(grep -c '^%Warning' "$OUT/lint.log" || true)
MINE=$(grep '^%Warning' "$OUT/lint.log" | grep -c -E "$OURS" || true)
echo ">> $ERRS error(s); $MINE warning(s) in our files, $((TOTAL - MINE)) in the staff's given files (ALL=1 shows them). Log: $OUT/lint.log"
echo "   Worth fixing: LATCH, UNDRIVEN, MULTIDRIVEN, WIDTH*, BLKSEQ, COMBDLY, CASEINCOMPLETE. UNUSED* on purpose-left ports is fine."
[ "$ERRS" = 0 ]
