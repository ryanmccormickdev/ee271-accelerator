#!/usr/bin/env bash
# Run an RTL design (any folder laid out like part2/unoptimized_verilog) through the staff
# software flow and Verilator, the same way part2/equivalence_testing/Makefile does with VCS.
#
#   record.sh <verilog_dir> <out_dir> example          the 6x3 Part 1 worked example, 2 PEs, INT16, with a VCD
#   record.sh <verilog_dir> <out_dir> int8|int16|int32  an official equivalence test size, 16 PEs, no VCD
#
# Optional environment: MSEED / VSEED (matrix / vector seeds, default 0 / 12345 like the official
# tests), PE_COUNT (default 2 for "example", 16 otherwise), SIM=icarus to use Icarus Verilog instead.
# Prints the testbench's "Computation took N clock cycles" line and whether MEM2 matches ivd-sim.
# This script contains no design: it only runs the one you point it at. It is how the page's
# waveform data was recorded (see README.md); you can point it at your own design too.
set -euo pipefail
VDIR="$(cd "$1" && pwd)"; OUT="$2"; WHAT="${3:-example}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$REPO/part2/ee271-conda-env/bin/python"
BIN="$REPO/part2/simulator/bin"
TB="$REPO/part2/equivalence_testing/testbench/tb_top.sv"
SIM="${SIM:-verilator}"
[ -x "$PY" ] || { echo "no Part 2 conda env at $PY (make setup PART=part2)"; exit 1; }
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"; cd "$OUT"

case "$WHAT" in
  example)
    PE="${PE_COUNT:-2}"; MODE=INT16
    "$PY" - <<'EOF'
import numpy as np
M = np.array([[1, 2, -1], [3, 0, 2], [-2, 1, 4], [0, -3, 1], [2, 2, 2], [-1, 4, 0]], dtype=np.int64)
v = np.array([[2], [-1], [3]], dtype=np.int64)
np.save("matrix.npy", M); np.save("vector.npy", v)
EOF
    ;;
  int8|int16|int32)
    PE="${PE_COUNT:-16}"; MODE=$(echo "$WHAT" | tr a-z A-Z)
    case "$WHAT" in int8) N=1024;; int16) N=512;; int32) N=256;; esac
    "$PY" "$BIN/ivd-mg" $N $N -5 5 --out matrix.npy --seed "${MSEED:-0}"
    "$PY" "$BIN/ivd-mg" $N 1 -5 5 --out vector.npy --seed "${VSEED:-12345}"
    ;;
  *) echo "unknown test '$WHAT'"; exit 1;;
esac

"$PY" "$BIN/ivd-cc" matrix.npy vector.npy $MODE --out_mem0 mem0.bits --out_mem1 mem1.bits --out_asm mat_mul.asm --pe_count "$PE"
LINES=$(( $(wc -l < mat_mul.asm) + 1 ))
DEPTH=128; while [ $DEPTH -le $LINES ]; do DEPTH=$((DEPTH * 2)); done     # ivd-as drops lines past the depth, and INST_COUNT must fit in log2(depth) bits
"$PY" "$BIN/ivd-as" mat_mul.asm --out inst.bits --pe_count "$PE" --controller_imem_depth $DEPTH
"$PY" "$BIN/ivd-gv" --out defines.sv --pe_count "$PE" --controller_imem_depth $DEPTH
"$PY" "$BIN/ivd-sim" --instruction_bits inst.bits --mem0_bits mem0.bits --mem1_bits mem1.bits --out out.bits --pe_count "$PE" --controller_imem_depth $DEPTH

# The three VCS-only calls, swapped for what Verilator and Icarus understand.
sed -e 's/\$vcdpluson;/$dumpfile("waves.vcd"); $dumpvars(0, tb_top);/' -e 's/\$vcdplusmemon;//' \
    -e 's/\$assertkill();//' -e 's/\$fatal(/$fatal(1, /' "$TB" > tb_top.sv
if [ "$SIM" = icarus ]; then
  iverilog -g2012 -o simv.vvp -I"$OUT" -I"$VDIR/logical" -y "$VDIR/logical" -Y .sv tb_top.sv > build.log 2>&1 || { tail -30 build.log; exit 1; }
  RUN="vvp -n simv.vvp"
else
  verilator --binary --timing -j 0 ${VFLAGS:-} -Wno-fatal -Wno-lint -Wno-style --trace --top-module tb_top \
    -I"$OUT" -I"$VDIR/logical" -y "$VDIR/logical" +libext+.sv tb_top.sv -o simv > build.log 2>&1 || { tail -30 build.log; exit 1; }
  RUN=./obj_dir/simv
fi
DUMP=+NODUMP; [ "$WHAT" = example ] && DUMP=""
$RUN $DUMP +INST_COUNT=$LINES +INST_FILE=inst.bits +MEM0_FILE=mem0.bits +MEM1_FILE=mem1.bits \
     +TIMEOUT=10000000 +OUTPUT_FILE=result.bits > sim.log 2>&1 || true
grep -E "took|ERROR|Timeout" sim.log || true
if [ -f result.bits ] && cmp -s result.bits out.bits; then
  echo "MEM2 matches ivd-sim ($WHAT, $MODE, $PE PEs, INST_COUNT=$LINES)"
else
  if [ -f result.bits ]; then
    echo "MEM2 MISMATCH ($WHAT, $MODE, $PE PEs): $( { diff result.bits out.bits || true; } | grep -c '^<' ) rows differ"
  else
    echo "MEM2 MISMATCH ($WHAT, $MODE, $PE PEs): no result.bits (the testbench never dumped MEM2)"
  fi
fi
