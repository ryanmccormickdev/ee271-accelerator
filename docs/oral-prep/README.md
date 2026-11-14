# Oral exam question banks

One Markdown file per topic. `docs/oral-prep-src/build.py` turns every `*.md` file in this folder (except
this README and files whose names start with `_`) into the practice page `docs/oral-prep.html`: Drill,
Mock exam, Browse and How to practise.

| Bank | Topic |
|---|---|
| `part1.md` | Part 1: the ISA, the compiler's mapping, PE / buffer / controller semantics, our Python code and how it differs from the staff's |
| `part2-rtl.md` | Part 2: the SystemVerilog RTL and its timing |
| `synthesis.md` | Part 2: synthesis with Design Compiler |
| `part3-ppa.md` | Part 3: power, performance, area and the FoM |
| `general.md` | Across the project: why SIMD, Python vs RTL vs gates, verification, who did what, AI use, Part 4 HLS |

Banks appear in that order; any other bank follows alphabetically.

## Rebuild the page

```sh
python3 docs/oral-prep-src/build.py
```

Standard library only, so any Python 3 works. It prints how many questions each bank contributed and a warning
for every entry it skipped or repaired. Add `--strict` to make it exit with status 1 when there were warnings.
Commit the `.md` files and the rebuilt `docs/oral-prep.html` together.

## The format

```markdown
# <Topic title>

### <Question, phrased the way an examiner would say it>
- **Tags:** part2, timing, controller
- **Level:** core
- **Answer:** <model answer in 2-6 sentences; concrete; may use `code`>
- **Our design:** <optional: what the pair must fill in from their own design, e.g. "Which cycle does your WRITE commit in?">
- **See:** <optional: page and anchor, e.g. docs/part2-rtl.html#timing, or file:line>
```

- **Levels:** `core` (must know cold), `deeper` (a likely follow-up), `stretch` (a hard follow-up).
- **Tags:** lowercase words, comma-separated. Always include the part (`part1`, `part2`, `part3`) or `general`.
  The other tags are topics. The mock exam follows a core question with a deeper one that shares a topic tag,
  so reuse existing tags (Drill's Tag menu lists them with counts) instead of inventing near-duplicates.
  `overview` marks a good opening question.
- Include "why" and "what would happen if" questions, and follow-up chains: a core question followed by its
  deeper follow-up on the same tags.
- **Answer:** one paragraph is the norm. Indented continuation lines are joined, lines starting with `- ` become a
  list, and a fenced code block works, but keep snippets short, and never put a complete module or a
  near-complete datapath in a bank.
- **See:** paths are relative to the repo root (`docs/...`, `part1/...`, `handouts/...`). `file:line` is fine; the
  link opens the file. For `docs/*.html#view/anchor` the build checks that the anchor exists. A link to a page
  that doesn't exist yet shows as plain text until it does.
- `## Section` headings are allowed; Browse shows them.

**Skipped, with a warning:** an entry with no question text, no **Answer**, a **Level** other than the three
above, or the same question twice in one bank. **Repaired, with a warning:** missing **Tags** or no part tag (the
part comes from the file name), a field name written without bold, an unknown field (kept as an extra note).

## Filling in "Our design"

The model answer covers the general case; the examiner will ask about *your* design. Put your answer on the
question's **Our design** line, after the word `Ours:`, then rebuild:

```markdown
- **Our design:** Which PE count did you choose, and what stopped you going higher? Ours: <what you chose>, because <the number that decided it> (<the report or file it comes from>).
```

The page shows the prompt in a yellow box and your answer in green under it, and Browse counts the filled-in
prompts per bank. Update them after each module passes its testbench, after each synthesis run, and after each
Part 3 experiment. Keep only the latest numbers and say which version they come from.

## Adding questions

- **After you finish a module, add the questions you'd ask your partner about it**, especially the ones that made
  you think: why it's done this way, what would break if it were different, how you checked it. Your partner
  practises on them, and you practise on theirs. A pull request's "Explain it" box (the teach-back rule in
  `docs/PLAN.md`) is already an oral answer: turn it into a question, and put the choice itself in `docs/decisions.md`.
- Keep answers checkable: a number you measured, a `file:line`, a cycle. Verify every number by running
  something. For Part 1, `part1/ee271-conda-env/bin/python docs/oral-prep-src/verify_part1.py` re-checks each
  number quoted in `part1.md` against our code and the staff's reference simulator.
- Saved progress is keyed to a question's words (case and punctuation don't matter) and its bank: rewording a
  question or moving it to another bank restarts its spaced repetition, while editing its answer, tags or links
  doesn't.
