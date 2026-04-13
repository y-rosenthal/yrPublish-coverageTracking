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
  - Open `sampleBooks/sample1/_book/index.html?prof=true`
  - Select multiple sections
  - Confirm sections covered by all selected sections differ from partially covered sections
  - Confirm small colored badges indicate which section(s) covered each item

## Update coverage

Edit `assets/coverage-tracking/coverage-data.json` and render again to publish updated highlights.
