# Fixtures

This directory contains synthetic, safe-to-share samples for testing and demos.

## Contents
- `documents/sample.pdf`: A small, generated PDF containing the text "Synthetic OCR Sample".
- `validatedDataset.csv`: Minimal CSV referencing the sample PDF.
- `sample.txt`: Plain-text sample content.

## Regenerate the PDF

```
node scripts/generate-synthetic-pdf.js
```

## Recommended env vars

- `VALIDATION_DIR=fixtures/documents`
- `VALIDATION_CSV_PATH=fixtures/validatedDataset.csv`
- `PDF_TEST_FILE=fixtures/documents/sample.pdf`
