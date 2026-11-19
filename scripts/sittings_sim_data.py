#!/usr/bin/env python3
"""Embed the recorded worked example into the "Watch it run" simulator of docs/part2-sittings.html.

Source: docs/part2-rtl-src/waves.json, design "ref" (a working design recorded through the staff
testbench on a 6x3 INT16 matrix with 2 PEs; see docs/part2-rtl-src/README.md). This keeps the per-cycle
signal values exactly as recorded and adds what the page needs to explain them: which instruction and
repetition each half is working on, and the MEM0/MEM1 contents (read back from the recorded reads).
Everything derived is cross-checked against the program, so a mismatch fails loudly.

    python3 scripts/sittings_sim_data.py          # rewrites the <script id="sim-data"> block in place
"""

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WAVES = REPO / "docs/part2-rtl-src/waves.json"
PAGE = REPO / "docs/part2-sittings.html"
KEEP = ["rst_n", "pc", "imem_a", "inst_valid", "begins", "state", "remaining", "buf_inst", "buf_valid",
        "m0_cen", "m0_a", "m0_q", "m1_a", "m1_q", "memb_q", "mode_q", "matrix_data", "vector_data",
        "pe_inst", "pe_valid", "acc0", "out0", "acc1", "out1", "output_data", "m2_gwen", "m2_a", "m2_d", "done"]


def main():
    ref = json.loads(WAVES.read_text())["designs"]["ref"]
    S = {k: ref["signals"][k]["v"] for k in KEEP}
    n = ref["cycles"]
    asm = list(ref["asm"]) + ["READ INT8 0 0 | MAC INT8 | 1 0 0"]       # the all-zero padding word
    reps = [int(line.split("|")[2].split()[0]) for line in asm]
    h = lambda k, c: int(S[k][c], 16)

    # who owns each half: an instruction taken at the end of cycle c issues buf_inst in c+1 .. c+reps
    buf_owner, pe_owner = [None] * n, [None] * n
    for c in range(n):
        if S["begins"][c] == "1":
            k = h("pc", c)
            for r in range(reps[k]):
                assert c + 1 + r < n and buf_owner[c + 1 + r] is None, (c, k, r)
                buf_owner[c + 1 + r] = [k, r + 1, reps[k]]
    for c in range(n):
        assert (buf_owner[c] is not None) == (S["buf_valid"][c] == "1"), c
        if S["pe_valid"][c] == "1":
            pe_owner[c] = buf_owner[c - 1]
            assert pe_owner[c] is not None, c
        # the buffer op in the recording matches the program line that owns it
        if buf_owner[c]:
            op = h("buf_inst", c) >> 34
            assert ["READ", "WRITE", "NOP"][op] == asm[buf_owner[c][0]].split()[0], (c, op)

    # MEM0 / MEM1 contents from the reads (address in cycle c, data in cycle c+1)
    mem0, mem1 = {}, {}
    for c in range(n - 1):
        if S["m0_cen"][c] == "0":
            a, q = h("m0_a", c), S["m0_q"][c + 1]
            assert mem0.setdefault(a, q) == q, ("MEM0 read twice with different data", a)
        if buf_owner[c] and asm[buf_owner[c][0]].startswith("READ"):
            a, q = h("m1_a", c), S["m1_q"][c + 1]
            assert mem1.setdefault(a, q) == q, ("MEM1 read twice with different data", a)

    data = {
        "source": "docs/part2-rtl-src/waves.json, design ref",
        "cycles": n, "took": ref["took"], "asm": asm, "reps": reps,
        "mem0": [mem0[a] for a in sorted(mem0)], "mem1": [mem1[a] for a in sorted(mem1)],
        "mem2_final": ref["mem2"], "gold": ref["gold"],
        "buf_owner": buf_owner, "pe_owner": pe_owner, "sig": S,
    }
    assert sorted(mem0) == list(range(len(mem0))) and sorted(mem1) == list(range(len(mem1)))
    assert ref["mem2"] == ref["gold"]

    html = PAGE.read_text(encoding="utf-8")
    pat = re.compile(r'(<script type="application/json" id="sim-data">)(.*?)(</script>)', re.S)
    assert pat.search(html), "no sim-data block in the page"
    blob = json.dumps(data, separators=(",", ":"))
    PAGE.write_text(pat.sub(lambda m: m.group(1) + blob + m.group(3), html, count=1), encoding="utf-8")
    print(f"embedded {n} cycles, {len(KEEP)} signals, MEM0 {len(mem0)} words, MEM1 {len(mem1)} words "
          f"({len(blob)} bytes) into {PAGE.relative_to(REPO)}")


if __name__ == "__main__":
    main()
