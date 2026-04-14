# Sample 1: Coverage Tracker Demo

This sample book demonstrates section-level coverage tracking in a portable Quarto setup.

Coverage data is stored under **`assets/coverage-tracking/coverage-data/<SECTION-ID>/`**, with **one CSV per rendered HTML page**, named:

`yr-coverage--<page-slug>.csv`

Example: `/chapter1.html` → `yr-coverage--chapter1.html.csv`. Nested paths use `--` instead of `/` (e.g. `/part-a/chapter.html` → `yr-coverage--part-a--chapter.html.csv`).

The browser loads **only the current page’s** CSV files (one fetch per class section per page).

## Render

From repo root:

```bash
quarto render sampleBooks/sample1
```

Output is written to `sampleBooks/sample1/_book/`.

## Test flows

- Student mode:
  - Open `sampleBooks/sample1/_book/index.html`
  - Confirm the page is blurred until one class section is selected
  - After selecting a class section, confirm the sidebar control text changes to that section name
  - Open the same URL in a different browser tab and confirm the picker appears again
  - Confirm the same blur + picker appears when opening deep links (for example `chapter1.html#sec-continuity-basics`) before any section is saved
  - Confirm covered sections are highlighted after selection
  - Click the section-named sidebar control to clear selection and re-open the picker
  - Confirm `?resetSection=true` also clears the saved student selection and shows the picker again

- Professor mode:
  - Open `sampleBooks/sample1/_book/index.html?prof=true` or `sampleBooks/sample1/_book/index.html?prof`
  - Navigate to another chapter and confirm the `prof` query parameter remains in the URL
  - After sections are applied, navigate pages and confirm the chooser does not auto-open
  - Select **one or more** sections using checkboxes, apply, then confirm **inline checkboxes** appear next to headings in the main content (color per section)
  - Confirm selected sections appear at the top of the left sidebar as color-coded entries
  - If no sections are selected, confirm one left-sidebar entry is shown as `Choose section(s)` and **no** inline checkboxes appear in the body
  - Click any professor sidebar entry and confirm the chooser popup opens again
  - Press `Esc` in the chooser and confirm it closes without applying changes
  - Test nested-id behavior (if a nested tracked id is uncovered inside a covered parent, nested region appears uncovered)
  - Toggle outer ids and confirm mixed descendant states use custom explicit-choice dialogs (check/uncheck all nested vs only this section)
  - Press `Esc` in that dialog and confirm no checkbox changes are applied
  - Outside the editor dialog, test professor inline undo/redo hotkeys (`Ctrl+Z` / `Ctrl+Y`)
  - Click `Edit page coverage CSV`, then test:
    - Confirm rows are shown in a single editor-like multiline control with gutter checkboxes
    - Set all covered
    - Set all explicit not-covered
    - Set all implicit not-covered
    - Make all not-covereds explicit / implicit
    - Undo/Redo buttons and keyboard shortcuts (`Ctrl+Z` / `Ctrl+Y`) even when focus is not in the text area
    - Individual row toggles cycle through covered / explicit not-covered / implicit not-covered (grey)
    - Edit a grey row text manually and confirm it becomes explicit (not grey)
    - Delete a row line and confirm it reverts to implicit (grey) rather than disappearing
    - Copy and download
  - Drag the dialog and confirm the underlying page remains scrollable while it is open
  - Close the dialog with the top-right `×` button
  - With the dialog open, toggle an **inline** checkbox and confirm the dialog row state stays in sync
  - Confirm sections covered by all selected sections differ from partially covered sections

## Update coverage

Edit the relevant **`yr-coverage--<page-slug>.csv`** under `assets/coverage-tracking/coverage-data/<SECTION-ID>/` and render again.

CSV supports rows like:

- `URL,html-id,covered`
- `URL,html-id,not-covered`
- `URL,html-id` (defaults to covered)
- `URL,html-id,` (defaults to covered)

Missing rows default to not covered.

## Helper tools

- Add missing heading IDs in one file:
  - `./tools/yrAddSectionsIds.sh sampleBooks/sample1/chapter1.qmd`
- Update per-page CSVs for one section from `.qmd` files (run with `--book-root` pointing at this book):

```bash
./tools/yrUpdateCoverage.sh --section MATH101-01 \
  --book-root sampleBooks/sample1 \
  --data-dir sampleBooks/sample1/assets/coverage-tracking/coverage-data \
  sampleBooks/sample1/index.qmd sampleBooks/sample1/chapter1.qmd sampleBooks/sample1/chapter2.qmd
```

This writes `yr-coverage--<page-slug>.updated.csv` next to each existing `yr-coverage--<page-slug>.csv` for review.
