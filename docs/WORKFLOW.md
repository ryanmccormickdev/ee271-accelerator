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

## Splitting part 1

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

## When part 2 is released

```sh
make update-starter PART=part2   # imports code.stanford.edu/EE271/simd-part2 as part2/
make setup PART=part2
```

If staff name the repo differently, run
`STARTER_URL=https://code.stanford.edu/EE271/<name>.git scripts/pull-starter.sh part2`.
Part 2 needs the Synopsys tools on caddy (once Farmshare is back). Clone this repo there over HTTPS
with a GitHub token, or add caddy's SSH key to GitHub.
