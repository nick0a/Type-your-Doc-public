echo 'import json, os, glob
import pandas as pd

# Find result files
results = []
for f in glob.glob("optimization_results/prompt_test_*.json"):
    with open(f) as file:
        results.append(json.load(file))

# Create a DataFrame
df = pd.DataFrame([
    (r["name"], r.get("accuracy", 0)*100) 
    for r in results
], columns=["Prompt", "Accuracy %"])

# Print sorted results
print(df.sort_values("Accuracy %", ascending=False))

# Save to CSV
df.to_csv("prompt_comparison.csv")
print(f"\nResults saved to prompt_comparison.csv")' > quick_compare.py
