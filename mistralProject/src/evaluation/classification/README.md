# SOF Page Classification Evaluation

This directory contains tools for evaluating the performance of the page classification system using labeled SOF documents.

## Overview

The evaluation system:
1. Creates a validation dataset from labeled pages
2. Runs the classifier against this dataset
3. Generates detailed reports on accuracy, precision, recall, and F1 scores

## Using the Labeled Pages Dataset

The system can use detailed page-level classifications from a CSV file with the format:

```
original_filename,page_number,category,subcategory
"sample.pdf",1,"Master Documents","Cargo Documents Table of Contents/Front Page"
...
```

This approach provides more precise evaluation by classifying each page individually, rather than just labeling entire documents.

## How to Run

### 1. Create Validation Dataset

```bash
npm run create:validation
```

This will:
- Read the labeled pages CSV file
- Match each labeled page with the corresponding document in the validation documents folder
- Generate a validation_dataset.csv file in the classification directory

### 2. Run the Evaluation

```bash
npm run run:validation
```

This will:
- Create the validation dataset if it doesn't exist
- Run the evaluation using Claude to classify each page
- Generate a detailed report with metrics

### 3. View Results

After running the evaluation, detailed reports will be available in:
- JSON report: `reports/classification/report_[timestamp].json`
- CSV results: `reports/classification/results_[timestamp].csv`
- Confusion matrix: `reports/classification/confusion_matrix_[timestamp].csv`

## Adding More Labeled Data

To expand the evaluation dataset:
1. Create a CSV file with the same format as `labeled-pages-sample.csv`
2. Add more document page classifications
3. Place the CSV file in the project root directory
4. Run the evaluation with the new file

## Understanding Categories

The evaluation system maps document categories to these classification types:
- `AGENT_SOF`: Pages containing Agent Statement of Facts
- `MASTER_SOF`: Pages containing Master/Ship Statement of Facts
- `OTHER`: All other document pages

## Metrics Explanation

The evaluation report includes:
- **Accuracy**: Percentage of correctly classified pages
- **Precision**: True positives / (True positives + False positives)
- **Recall**: True positives / (True positives + False negatives)
- **F1 Score**: Harmonic mean of precision and recall (2 * precision * recall / (precision + recall))
- **Confusion Matrix**: Shows predicted vs. actual classifications 
