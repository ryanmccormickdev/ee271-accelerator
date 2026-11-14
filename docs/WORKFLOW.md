# How we work together in this repo

Two people, one repo, about one week per part. The goal is to never lose work, never overwrite
each other, and both of us understanding all of the code (the oral quiz can ask either of us
about any of it).

## The words, quickly

- **Commit**: a saved snapshot of the files, with a message. It lives only on your computer until you push.
- **Push / pull**: upload your commits to GitHub / download your partner's.
- **Branch**: a separate line of commits, so you can work without touching `main` until you're ready.
- **Pull request (PR)**: a GitHub page that says "please merge my branch into `main`". Your partner reads the diff there.
- **Merge conflict**: both of you changed the same lines. Git stops and asks you to pick the result.

## Splitting part 1 (done; kept for reference)

The three files depend on each other in one direction only:

```
processing_element.py   (alone: make test-pe)        ─┐
main_buffer.py          (alone: make test-buffer)    ─┴─>  accelerator.py  (make test-accel)
```

So one of us takes the processing element (PE) and the other takes the main buffer, in parallel.
Then we write `accelerator.py` together, since it's short and it's where the two pieces meet.
Two people editing different files almost never conflict.

## The daily loop

```sh
git switch main && git pull          # 1. start from the latest main
git switch -c pe-mac                 # 2. new branch for what you're about to do (short name)
# ... edit, run make test-pe ...
git add -A && git commit -m "PE: MAC for all three modes"   # 3. commit early and often
git push -u origin pe-mac            # 4. upload the branch (after the first time: just `git push`)
gh pr create --fill                  # 5. open a PR (or use the link git prints)
```

The partner reads the PR, asks about anything unclear, and merges it on GitHub. Then both of us run
`git switch main && git pull`.

Short on time? Pushing straight to `main` is fine for small things. Just `git pull` before you start
and push when you stop.

**Good commit messages** say what changed and why, in a line: `Main buffer: INT8 READ selects byte via offset[1:0]`.

## Useful checks

```sh
git status            # what's changed / staged / which branch am I on
git diff              # exactly what I changed since the last commit
git log --oneline -10 # recent history
git switch -          # go back to the previous branch
```

## Merge conflicts

If `git pull` or a merge says `CONFLICT`, open the file and look for:

```
<<<<<<< HEAD
your version
=======
their version
>>>>>>> main
```

Edit it into the version you actually want, delete the three marker lines, then
`git add <file> && git commit`. VS Code shows "Accept Current / Incoming / Both" buttons over each conflict.
When in doubt, call your partner before resolving.

## Staff updates to the starter code

Staff sometimes push fixes to the starter repo (they already did once, two days after release).
To bring them in:

```sh
git switch main && git pull
make update-starter          # commit or stash your work first
git push
```

This merges the staff's changes into `part1/`. If they touched a file we've also edited,
you get a normal merge conflict (above).

## Parts 2 and 3

The plan, the split and the calendar are in `docs/PLAN.md`. The git side:

- `part2/` is the staff starter (imported Nov 14 from `simd-part2`, upstream `d19e793`). Pull staff fixes with
  `make update-starter PART=part2` (commit or stash first). Don't edit files we don't own in `part2/`. Our code goes
  only in `part2/unoptimized_verilog/logical/{processing_element,buffer,controller,top}.sv` (and, for Part 3,
  `part2/optimized_verilog/`), so staff updates merge cleanly.
- One branch per module or experiment: `p2/pe`, `p2/ctl`, `p2/buf`, `p2/top`; `p3/sizing`, `p3/mulshare`,
  `p3/pipeline`, `p3/clockgate`. Open a PR; the PR template has an **Explain it** box. The reviewer explains the change
  back to the author before approving.
- `main` must always pass `make check`. Run `make eq-stress` too before merging anything that touches timing or arithmetic.
- After submitting Part 2: `git tag part2-submitted && git push --tags`, then
  `cp -R part2/unoptimized_verilog part2/optimized_verilog` (Part 3 works there; `RTL=optimized_verilog` on every `make`).
- Synthesis results we cite go in `runs/<tag>/` (committed) and `docs/experiments.md`.

## Working on caddy (VCS and Design Compiler)

The Synopsys tools exist only on Stanford's caddy machines (Ed #224: reach them over ssh, ideally from a FarmShare
OnDemand desktop so the GUIs work without X forwarding).

```sh
ssh <sunetid>@login.farmshare.stanford.edu          # or use the OnDemand desktop's terminal
ssh -XY caddy.best.stanford.edu                      # (staff also wrote caddyXX.stanford.edu)
git clone https://github.com/<owner>/ee271-project.git && cd ee271-project
make setup PART=part2                                # Linux conda env, bitstring<5 pinned (once per machine)
tcsh                                                 # the course's module setup is tcsh
source part2/load_modules.sh                         # vcs/S-2021.09-SP1, dc_shell/S-2021.06-SP5-4, ivd-* on PATH
make vcs-eq                                          # the graded tests, in VCS
make synth                                           # Design Compiler; record in runs/<tag>/
git add runs/<tag> && git commit -m "Synth: ..." && git push
```

GitHub over HTTPS from caddy needs a personal access token as the password (GitHub → Settings → Developer settings
→ Tokens, scope `repo`), or add an SSH key made on caddy to your GitHub account. If `make setup` can't find conda
there, install Miniconda in your home directory (handout Part 1, section 2.2).
`code.stanford.edu` needs its own SSH key per machine (Ed #220), but we never clone from there directly: the
starter comes in over HTTPS through `make update-starter`.
