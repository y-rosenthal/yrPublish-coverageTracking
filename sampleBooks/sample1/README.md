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
  - Confirm covered sections are highlighted after selection

- Professor mode:
  - Open `sampleBooks/sample1/_book/index.html?prof=true`
  - Select multiple sections
  - Confirm sections covered by all selected sections differ from partially covered sections
  - Confirm small colored badges indicate which section(s) covered each item

## Update coverage

Edit `assets/coverage-data.json` and render again to publish updated highlights.
