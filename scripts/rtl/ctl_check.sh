#!/usr/bin/env bash
# Controller check: our controller.sv (with the given instruction_memory.sv) against hand-written and compiled
# programs. Independent of the buffer and the PE, so it can be done in parallel with them.
#
#   scripts/rtl/ctl_check.sh            (WAVES=1 dumps waveforms)
set -euo pipefail
. "$(dirname "$0")/common.sh"

OUT="$BUILD/ctl_check/${RTL_NAME}-${SIM}"
rm -rf "$OUT"; mkdir -p "$OUT"
ivd gv --out "$OUT/defines.sv"
cp "$REPO/verif/ctl_check/tb_ctl_trace.sv" "$OUT/"
note "building the controller check from $LOGICAL/controller.sv"
build_sim "$OUT" tb_ctl_trace "$OUT/tb_ctl_trace.sv" "$RTL_DIR/validation/testbenches"

# a real compiled program too: 70x5 INT8 with 16 PEs (2 row tiles)
mkdir -p "$OUT/compiled"
( cd "$OUT/compiled" && ivd mg 70 5 -5 5 --out m.npy && ivd mg 5 1 -5 5 --out v.npy --seed 12345 \
  && ivd cc m.npy v.npy INT8 --out_mem0 mem0.bits --out_mem1 mem1.bits --out_asm compiled.asm ) > "$OUT/compiled.log" 2>&1

STATUS=0
for asm in "$REPO"/verif/ctl_check/programs/*.asm "$OUT/compiled/compiled.asm"; do
  name=$(basename "$asm" .asm); run="$OUT/$name"; mkdir -p "$run"
  ivd as "$asm" --out "$run/inst.bits" > "$run/as.log" 2>&1 || { cat "$run/as.log"; die "assembling $asm failed"; }
  n=$(( $(grep -c . "$asm") + 1 ))
  DUMP=""; [ "$WAVES" = 1 ] && DUMP="+DUMP"
  # shellcheck disable=SC2086
  ( cd "$run" && $SIM_CMD $DUMP +INST_COUNT=$n +INST_FILE=inst.bits +TRACE=trace.txt ) > "$run/sim.log" 2>&1 || true
  grep -q TIMEOUT "$run/sim.log" && echo "  $name: the program never finished (see $run/trace.txt)"
  printf '%-14s ' "$name"
  "$PY" "$REPO/verif/ctl_check/check.py" "$asm" "$run/inst.bits" "$n" "$run/trace.txt" || STATUS=1
done
echo ">> traces: $OUT/<program>/trace.txt (one line per cycle: what the controller presented)"
exit $STATUS
