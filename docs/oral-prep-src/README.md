# Sources for `docs/oral-prep.html`

The practice page is one self-contained HTML file built from these pieces and from the question banks in
`docs/oral-prep/*.md` (format and rules: `docs/oral-prep/README.md`). Edit here or in a bank, then rebuild:

```sh
python3 docs/oral-prep-src/build.py            # options: --banks DIR, --out FILE, --strict
```

| File | What it is |
|---|---|
| `build.py` | Reads every bank, renders a small, safe subset of Markdown (code, bold, italics, links, lists, code fences; all other HTML is escaped), checks each **See:** target and `#anchor`, and embeds everything as JSON in the page. A bad entry is skipped with a warning and never stops the build. Standard library only. |
| `page.html` | Page structure and the fixed text, including the whole "How to practise" tab. |
| `style.css` | Styles. The colour tokens and base rules at the top are copied verbatim from `docs/walkthrough-src/style.css`, so the pages look like one family; `build.py` warns if the tokens drift. |
| `app.js` | Drill with spaced repetition, Mock exam (plan, timer, examiner and examinee views, summary), Browse with search and print, and the per-person profiles. |
| `verify_part1.py` | Re-checks every number quoted in `docs/oral-prep/part1.md` by running our Part 1 code and the staff's reference simulator side by side. Run it with the Part 1 environment: `part1/ee271-conda-env/bin/python docs/oral-prep-src/verify_part1.py` (about 10 s; exit status = number of failed checks). |

## How the page behaves

- **Saved data.** Progress is kept per person in the browser's localStorage under keys starting with
  `ee271oral:` (`profiles`, `progress:<person>`, `drill`, `mockxbanks`). The light/dark choice shares the
  walkthrough's key, `ee271wt:theme`. Every access is wrapped in `try`/`catch`; when storage is blocked the page
  still works and says that progress lasts only until the tab closes. To start over, clear the site data for the
  page.
- **Spaced repetition.** Gaps are counted in graded questions, not days: missed comes back after 2, shaky after 5,
  got it after 12, then 25, 50 and 100. Drill shows due questions first (usually the most urgent of the top 3),
  mixes in unseen ones with core weighted highest, and otherwise shows whatever is due soonest.
- **Mock exam plan.** An opening question tagged `overview`, then rounds over the parts present (shuffled, General
  last). Each round is a core question followed by the deeper question that shares the most topic tags with it;
  the last follow-up is a stretch question when one fits. With "weak spots" on, picks lean towards the examinee's
  missed, then shaky, unseen and due questions. With it off, the plan depends only on the plan code, the number of
  questions, the chosen banks and the page build, so a second screen with the same code shows the same exam.
- **Print.** Browse prints every question with its answer opened, in light colours; the other tabs are hidden.
