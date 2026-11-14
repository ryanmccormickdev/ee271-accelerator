#!/usr/bin/env bash
# Buffer unit test: our buffer.sv against the staff's Python MainBuffer, driven directly (4 PEs: 128-bit words).
#
#   scripts/rtl/buf_unit.sh            (SEED=n changes the random section, WAVES=1 dumps a waveform)
set -euo pipefail
. "$(dirname "$0")/common.sh"

OUT="$BUILD/buf_unit/${RTL_NAME}-${SIM}"
rm -rf "$OUT"; mkdir -p "$OUT"
"$PY" "$REPO/verif/buf_unit/gen.py" "$OUT" --seed "${SEED:-1}" > "$OUT/gen.log" 2>&1 || { cat "$OUT/gen.log"; die "vector generation failed"; }
ivd gv --out "$OUT/defines.sv" --pe_count 4
cp "$REPO/verif/buf_unit/tb_buf_unit.sv" "$OUT/"
note "building the buffer unit test from $LOGICAL/buffer.sv ($(cat "$OUT/gen.log"))"
build_sim "$OUT" tb_buf_unit "$OUT/tb_buf_unit.sv"
DUMP=""; [ "$WAVES" = 1 ] && DUMP="+DUMP"
# shellcheck disable=SC2086
( cd "$OUT" && $SIM_CMD $DUMP ) > "$OUT/sim.log" 2>&1 || { tail -20 "$OUT/sim.log"; die "simulation failed"; }
if "$PY" "$REPO/verif/buf_unit/check.py" "$OUT"; then echo "Buffer unit test: PASS"; else echo "Buffer unit test: FAIL (re-run with WAVES=1, then make waves)"; exit 1; fi
