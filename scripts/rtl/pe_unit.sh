#!/usr/bin/env bash
# PE unit test: our processing_element.sv against the staff's Python reference PE, driven directly.
#
#   scripts/rtl/pe_unit.sh            (ACC=<accumulator signal name in your PE> also checks the accumulator,
#                                      SEED=n changes the random section, WAVES=1 dumps a waveform)
set -euo pipefail
. "$(dirname "$0")/common.sh"

OUT="$BUILD/pe_unit/${RTL_NAME}-${SIM}"
rm -rf "$OUT"; mkdir -p "$OUT"
"$PY" "$REPO/verif/pe_unit/gen_vectors.py" "$OUT" --seed "${SEED:-1}" > "$OUT/gen.log" 2>&1 \
  || { cat "$OUT/gen.log"; die "vector generation failed"; }
ivd gv --out "$OUT/defines.sv"
cp "$REPO/verif/pe_unit/tb_pe_unit.sv" "$OUT/tb_pe_unit.sv"
if [ -n "${ACC:-}" ]; then
  # pass the accumulator's hierarchical name into the testbench as a macro
  sed -i.bak "1i\\
\`define ACC_PATH $ACC
" "$OUT/tb_pe_unit.sv" && rm -f "$OUT/tb_pe_unit.sv.bak"
fi
note "building the PE unit test from $LOGICAL/processing_element.sv ($(cat "$OUT/gen.log"))"
build_sim "$OUT" tb_pe_unit "$OUT/tb_pe_unit.sv"
DUMP=""; [ "$WAVES" = 1 ] && DUMP="+DUMP"
# shellcheck disable=SC2086
( cd "$OUT" && $SIM_CMD $DUMP +VECTORS=vectors.txt +OBSERVED=observed.txt ) > "$OUT/sim.log" 2>&1 \
  || { tail -20 "$OUT/sim.log"; die "simulation failed"; }
"$PY" "$REPO/verif/pe_unit/check.py" "$OUT"
