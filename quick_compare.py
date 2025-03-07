import json
import os
import glob
import pandas as pd

# Find all result files
results = []
for f in glob.glob("optimization_results/prompt_test_*.json"):
    try:
        with open(f) as file:
            results.append(json.load(file))
    except Exception as e:
        print(f"Error loading {f}: {e}")

# Check if we found any results
if not results:
    print("No result files found! Check the path.")
    exit(1)

# Create a DataFrame with results
df = pd.DataFrame([
    (r["name"], r.get("accuracy", 0)*100) 
    for r in results
], columns=["Prompt", "Accuracy %"])

# Print sorted results
print("\nPrompt Performance Summary:")
print("==========================")
print(df.sort_values("Accuracy %", ascending=False))

# Save to CSV
df.to_csv("prompt_comparison.csv")
print(f"\nResults saved to prompt_comparison.csv")
