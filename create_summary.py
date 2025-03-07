import pandas as pd
import json
import os

# Try to read the best prompt file
best_prompt_path = "doc_classifier/best_prompt.json"
if os.path.exists(best_prompt_path):
    try:
        with open(best_prompt_path) as f:
            best_prompt = json.load(f)
        print(f"Best prompt from file: {best_prompt.get('name', 'Unknown')}")
        print(f"Accuracy: {best_prompt.get('accuracy', 0)*100:.2f}%")
    except Exception as e:
        print(f"Error reading best prompt file: {e}")

# Create a summary table from the results we saw
results = [
    {"name": "pattern_matching", "accuracy": 0.95, "notes": "Best performing for most documents"},
    {"name": "two_step_reasoning", "accuracy": 0.95, "notes": "Correctly handled RIDER_CLAUSES that others missed"},
    {"name": "baseline", "accuracy": 0.90, "notes": "Simple prompt, decent performance"},
    {"name": "detailed_types", "accuracy": 0.90, "notes": "Good with CHARTER_PARTY documents"},
    {"name": "context_focused", "accuracy": 0.90, "notes": "Struggled with same documents as baseline"}
]

# Create a DataFrame
df = pd.DataFrame(results)
df["Accuracy %"] = df["accuracy"] * 100

# Add information about which document types each prompt was good at
document_strengths = {
    "pattern_matching": ["ADDENDUM", "AGENT_SOF", "MASTERS_CARGO_DOCS", "RECAP_NOTE", "VOYAGE_ORDER"],
    "two_step_reasoning": ["ADDENDUM", "CHARTER_PARTY", "MASTERS_CARGO_DOCS", "RECAP_NOTE", "RIDER_CLAUSES", "VOYAGE_ORDER"],
    "baseline": ["ADDENDUM", "CHARTER_PARTY", "MASTERS_CARGO_DOCS", "RECAP_NOTE", "VOYAGE_ORDER"],
    "detailed_types": ["ADDENDUM", "CHARTER_PARTY", "MASTERS_CARGO_DOCS", "RECAP_NOTE", "VOYAGE_ORDER"],
    "context_focused": ["ADDENDUM", "CHARTER_PARTY", "MASTERS_CARGO_DOCS", "RECAP_NOTE", "VOYAGE_ORDER"]
}

# Add column for document type strengths
df["Strong Document Types"] = df["name"].apply(lambda x: ", ".join(document_strengths.get(x, [])))

# Reorder and select columns
df = df[["name", "Accuracy %", "Strong Document Types", "notes"]]
df.columns = ["Prompt Name", "Accuracy %", "Strong Document Types", "Notes"]

# Sort by accuracy
df = df.sort_values("Accuracy %", ascending=False)

# Print the table
print("\nPrompt Performance Summary:")
print("==========================")
print(df)

# Save as CSV
output_path = "prompt_comparison_summary.csv"
df.to_csv(output_path, index=False)
print(f"\nSummary saved to {output_path}")

# Create an HTML version with better formatting
html_path = "prompt_comparison_summary.html"
html = f"""
<!DOCTYPE html>
<html>
<head>
    <title>Prompt Comparison Summary</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f2f2f2; }}
        tr:nth-child(even) {{ background-color: #f9f9f9; }}
        .accuracy {{ font-weight: bold; }}
        h1, h2 {{ color: #333; }}
    </style>
</head>
<body>
    <h1>Prompt Comparison Summary</h1>
    <p>Based on the validation runs with 20 documents</p>
    
    {df.to_html(classes='table', index=False)}
    
    <h2>Notes on Document Types</h2>
    <ul>
        <li><strong>pattern_matching</strong>: Excellent for most document types (95% accuracy)</li>
        <li><strong>two_step_reasoning</strong>: Only prompt that correctly identified RIDER_CLAUSES (95% accuracy)</li>
        <li>Prompts with 90% accuracy missed similar documents</li>
    </ul>
    
    <p>Generated on: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
</body>
</html>
"""

with open(html_path, "w") as f:
    f.write(html)
print(f"HTML report saved to {html_path}")
