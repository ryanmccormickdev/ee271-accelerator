# Synthesis run records

`make synth` (on caddy) copies each Design Compiler run here as `runs/<tag>/`: `results.txt`, the area / power /
timing / QoR reports, `compile.log`, and `run.txt` (RTL folder, PE count, clock period, git commit, host, runtime).
The staff flow overwrites its `reports/` on every run. These copies are what the Part 3 report cites, so **commit the
ones you use** (they're small text files) and give them meaningful tags, e.g. `TAG=baseline`, `TAG=p32-t1.8`,
`TAG=mulshare-p48`.

`make fom RUN=runs/<tag> BASE=runs/<other>` computes the FoM and the % change between two records.
