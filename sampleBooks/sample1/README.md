# Sample 1: Coverage Tracker Demo

This sample book demonstrates section-level coverage tracking in a portable Quarto setup.

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
  - Select zero or more sections using checkboxes
  - Confirm selected sections appear at the top of the left sidebar as color-coded entries
  - If no sections are selected, confirm one left-sidebar entry is shown as `Choose section(s)`
  - Click any professor sidebar entry and confirm the chooser popup opens again
  - Press `Esc` in the chooser and confirm it closes without applying changes
  - Confirm sections covered by all selected sections differ from partially covered sections
  - Confirm small colored badges indicate which section(s) covered each item

## Update coverage

Edit `assets/coverage-tracking/coverage-data.json` and render again to publish updated highlights.
