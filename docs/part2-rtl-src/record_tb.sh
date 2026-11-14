#!/usr/bin/env bash
# Run one of the staff module testbenches (part2/unoptimized_verilog/validation/testbenches/tb_<name>.sv)
# on an RTL design, the way the validation Makefile does with VCS, but with Verilator or Icarus.
#
#   record_tb.sh <verilog_dir> <pe|controller|buffer|buffer_wb|top> <out_dir> [INST_COUNT]
#
# SIM=icarus picks Icarus Verilog (4-state, event-driven) instead of Verilator (2-state).
# The software is built exactly as the validation Makefile builds it (16 PEs, depth 128):
# pe -> pe_test.asm, buffer_wb -> buffer_wb_test.asm, anything else -> the 10x5 INT8 matrix.
# Writes waves.vcd and sim.log into <out_dir>. Contains no design.
set -euo pipefail
VDIR="$(cd "$1" && pwd)"; TBN="$2"; OUT="$3"; N="${4:-3}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$REPO/part2/ee271-conda-env/bin/python"
BIN="$REPO/part2/simulator/bin"
VAL="$REPO/part2/unoptimized_verilog/validation/testbenches"
SIM="${SIM:-verilator}"
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"; cd "$OUT"
"$PY" "$BIN/ivd-gv" --out defines.sv
case "$TBN" in
  pe)        "$PY" "$BIN/ivd-as" "$VAL/pe_test.asm" --out inst.bits ;;
  buffer_wb) "$PY" "$BIN/ivd-as" "$VAL/buffer_wb_test.asm" --out inst.bits ;;
  *)         "$PY" "$BIN/ivd-mg" 10 5 -5 5 --out matrix.npy
             "$PY" "$BIN/ivd-mg" 5 1 -5 5 --out vector.npy --seed 12345
             "$PY" "$BIN/ivd-cc" matrix.npy vector.npy INT8 --out_mem0 mem0.bits --out_mem1 mem1.bits --out_asm mat_mul.asm
             "$PY" "$BIN/ivd-as" mat_mul.asm --out inst.bits ;;
esac
for f in "$VAL"/*.sv; do
  sed -e 's/\$vcdpluson;/$dumpfile("waves.vcd"); $dumpvars(0, tb_'"$TBN"');/' -e 's/\$vcdplusmemon;//' \
      -e 's/\$assertkill();//' -e 's/\$fatal(/$fatal(1, /' "$f" > "$(basename "$f")"
done
if [ "$SIM" = icarus ]; then
  iverilog -g2012 -o simv.vvp -I"$OUT" -I"$VDIR/logical" -y "$OUT" -y "$VDIR/logical" -Y .sv "tb_$TBN.sv" > build.log 2>&1 || { tail -30 build.log; exit 1; }
  RUN="vvp -n simv.vvp"
else
  verilator --binary --timing -j 0 ${VFLAGS:-} -Wno-fatal -Wno-lint -Wno-style --trace --top-module "tb_$TBN" \
    -I"$OUT" -I"$VDIR/logical" -y "$OUT" -y "$VDIR/logical" +libext+.sv "tb_$TBN.sv" -o simv > build.log 2>&1 || { tail -30 build.log; exit 1; }
  RUN=./obj_dir/simv
fi
ARGS="+INST_COUNT=$N +INST_FILE=inst.bits +TIMEOUT=10000000"
[ -f mem0.bits ] && ARGS="$ARGS +MEM0_FILE=mem0.bits +MEM1_FILE=mem1.bits"
$RUN $ARGS > sim.log 2>&1 || true
grep -E "Complete|ERROR|Timeout|finish" sim.log | head -5
