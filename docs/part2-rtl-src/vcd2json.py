"""Turn the waveform dumps that record.sh writes into docs/part2-rtl-src/waves.json, the data behind
the page's Cycles tab. Standard library only.

    python3 docs/part2-rtl-src/vcd2json.py ref=<run dir> [name=<run dir> ...] [--out waves.json]

Each run dir is one `record.sh <design> <dir> example` run: it holds waves.vcd, result.bits (the
RTL's MEM2 dump), out.bits (ivd-sim's MEM2), mat_mul.asm and sim.log. The first run must be the
correct design ("ref"); the others are compared against it.

Cycle convention (the page uses the same one): the testbench clock rises at 5, 15, 25, ... ns.
Cycle n is the period that ends with the rising edge at 10n + 5 ns, and a signal's value "in
cycle n" is its value just before that edge, which is what the flip-flops capture. The script
checks that, apart from the clock and rst_n, nothing changes between rising edges (true for a
zero-delay synchronous design), so a per-cycle table is an exact picture of the waveform.
"""
import json
import os
import re
import sys

# (key, VCD name under tb_top, label shown on the page)
SIGNALS = [
    ("rst_n", "rst_n", "rst_n"),
    ("pc", "dut.u_instruction_memory.program_counter", "program_counter"),
    ("imem_a", "dut.u_instruction_memory.memory_address", "memory_address"),
    ("inst", "dut.inst", "inst"),
    ("inst_valid", "dut.inst_valid", "inst_valid"),
    ("begins", "dut.inst_exec_begins", "inst_exec_begins"),
    ("state", "dut.u_controller.state", "state"),
    ("remaining", "dut.u_controller.remaining", "remaining"),
    ("buf_inst", "dut.buf_inst", "buf_inst"),
    ("buf_valid", "dut.buf_inst_valid", "buf_inst_valid"),
    ("m0_cen", "dut.u_buffer.u_matrix_mem.cen", "MEM0 cen"),
    ("m0_a", "dut.u_buffer.u_matrix_mem.a", "MEM0 a"),
    ("m0_q", "dut.u_buffer.u_matrix_mem.q", "MEM0 q"),
    ("m1_a", "dut.u_buffer.u_vector_mem.a", "MEM1 a"),
    ("m1_q", "dut.u_buffer.u_vector_mem.q", "MEM1 q"),
    ("memb_q", "dut.u_buffer.memb_q", "registered offset"),
    ("mode_q", "dut.u_buffer.mode_q", "registered mode"),
    ("matrix_data", "dut.matrix_data", "matrix_data"),
    ("vector_data", "dut.vector_data", "vector_data"),
    ("pe_inst", "dut.pe_inst", "pe_inst"),
    ("pe_valid", "dut.pe_inst_valid", "pe_inst_valid"),
    ("acc0", "dut.g_pe[0].u_pe.acc", "PE 0 acc"),
    ("out0", "dut.g_pe[0].u_pe.vector_output", "PE 0 out"),
    ("acc1", "dut.g_pe[1].u_pe.acc", "PE 1 acc"),
    ("out1", "dut.g_pe[1].u_pe.vector_output", "PE 1 out"),
    ("output_data", "dut.output_data", "output_data"),
    ("m2_gwen", "dut.u_buffer.u_output_mem.gwen", "MEM2 gwen"),
    ("m2_a", "dut.u_buffer.u_output_mem.a", "MEM2 a"),
    ("m2_d", "dut.u_buffer.u_output_mem.d", "MEM2 d"),
    ("done", "simulation_complete", "simulation_complete"),
]
ASYNC_OK = {"rst_n"}          # the testbench releases reset at 50 ns, on a falling edge


def parse_vcd(path):
    """Return ({full_name: (id, width)}, {id: [(time_ps, bitstring)]}, timescale_ps)."""
    names, changes, scope, scale = {}, {}, [], 1
    t = 0
    with open(path) as f:
        header = True
        for line in f:
            s = line.strip()
            if header:
                if s.startswith("$timescale"):
                    m = re.search(r"(\d+)\s*(ps|ns|us|fs)", s if "$end" in s else s + next(f))
                    scale = int(m.group(1)) * {"fs": 0.001, "ps": 1, "ns": 1000, "us": 1000000}[m.group(2)]
                elif s.startswith("$scope"):
                    scope.append(s.split()[2])
                elif s.startswith("$upscope"):
                    scope.pop()
                elif s.startswith("$var"):
                    p = s.split()
                    width, ident, name = int(p[2]), p[3], p[4]
                    names[".".join(scope + [name])] = (ident, width)
                elif s.startswith("$enddefinitions"):
                    header = False
                continue
            if not s or s.startswith("$"):
                continue
            if s[0] == "#":
                t = int(s[1:]) * scale
            elif s[0] in "bB":
                val, ident = s[1:].split()
                changes.setdefault(ident, []).append((t, val))
            else:
                changes.setdefault(s[1:], []).append((t, s[0]))
    return names, changes


def value_at(ch, t):
    """Value just before time t (the last change strictly earlier than t)."""
    v = None
    for tt, val in ch:
        if tt >= t:
            break
        v = val
    return v


def to_hex(bits, width):
    if bits is None:
        return None
    if re.search(r"[xXzZ]", bits):
        return "x" * ((width + 3) // 4)
    return format(int(bits, 2), "0{}x".format((width + 3) // 4))


def read_rows(path, n):
    with open(path) as f:
        rows = [next(f).strip() for _ in range(n)]
    return [format(int(r, 2), "0{}x".format(len(r) // 4)) if re.fullmatch("[01]+", r) else r for r in rows]


def convert(run_dir, ref_cycles=None):
    names, changes = parse_vcd(os.path.join(run_dir, "waves.vcd"))
    top = "tb_top."
    clk_id = names[top + "clk"][0]
    rises = [t for t, v in changes[clk_id] if v == "1" and t > 0]
    period = rises[1] - rises[0]
    log = open(os.path.join(run_dir, "sim.log")).read()
    m = re.search(r"Computation took (\d+) clock cycles", log)
    took = int(m.group(1)) if m else None
    ncyc = (took + 1) if took is not None else len(rises)
    if ref_cycles:
        ncyc = max(ncyc, ref_cycles)
    ncyc = min(ncyc, len(rises))
    rst_rise = [t for t, v in changes[names[top + "rst_n"][0]] if v == "1"]
    sig = {}
    for key, vname, label in SIGNALS:
        full = top + vname
        if full not in names:
            sig[key] = None
            continue
        ident, width = names[full]
        ch = changes.get(ident, [])
        if key not in ASYNC_OK:
            # inst_valid depends on rst_n combinationally, so it may also move when reset is released
            stray = [t for t, _ in ch if t > 0 and (t - rises[0]) % period != 0 and t not in rst_rise]
            if stray:
                raise SystemExit(f"{run_dir}: {vname} changes between clock edges at {stray[:4]} ps")
        sig[key] = {"w": width, "v": [to_hex(value_at(ch, rises[c]), width) for c in range(ncyc)]}
    asm = [l.rstrip("\n") for l in open(os.path.join(run_dir, "mat_mul.asm")) if l.strip()]
    return {
        "took": took,
        "cycles": ncyc,
        "period_ps": period,
        "first_rise_ps": rises[0],
        "rst_release_ps": rst_rise[0] if rst_rise else None,
        "asm": asm,
        "mem2": read_rows(os.path.join(run_dir, "result.bits"), 4) if os.path.exists(os.path.join(run_dir, "result.bits")) else None,
        "gold": read_rows(os.path.join(run_dir, "out.bits"), 4),
        "signals": sig,
    }


def main(argv):
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "waves.json")
    pairs = []
    i = 0
    while i < len(argv):
        if argv[i] == "--out":
            out = argv[i + 1]
            i += 2
            continue
        name, _, path = argv[i].partition("=")
        pairs.append((name, path))
        i += 1
    if not pairs or pairs[0][0] != "ref":
        raise SystemExit(__doc__)
    designs, ref_cycles = {}, None
    for name, path in pairs:
        d = convert(path, ref_cycles)
        if name == "ref":
            ref_cycles = d["cycles"]
        designs[name] = d
        print(f"{name:20s} took {d['took']} cycles, {d['cycles']} sampled, MEM2[0..1] = {d['mem2'][:2] if d['mem2'] else None}")
    data = {"signals": [[k, l] for k, _, l in SIGNALS], "designs": designs}
    with open(out, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"wrote {out} ({os.path.getsize(out):,} bytes)")


if __name__ == "__main__":
    main(sys.argv[1:])
