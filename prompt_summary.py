import pandas as pd

# Create a summary table from the results
results = [
    {"name": "pattern_matching", "accuracy": 0.95, "notes": "Best performing"},
    {"name": "two_step_reasoning", "accuracy": 0.95, "notes": "Correctly handled RIDER_CLAUSES"},
    {"name": "baseline", "accuracy": 0.90, "notes": "Simple prompt"},
    {"name": "detailed_types", "accuracy": 0.90, "notes": "Good with CHARTER_PARTY"},
    {"name": "context_focused", "accuracy": 0.90, "notes": "Similar to baseline"}
]

# Create a DataFrame
df = pd.DataFrame(results)
df["Accuracy %"] = df["accuracy"] * 100

# Sort by accuracy
df = df.sort_values("Accuracy %", ascending=False)
df = df[["name", "Accuracy %", "notes"]]
df.columns = ["Prompt Name", "Accuracy %", "Notes"]

# Print the table
print("
Prompt Performance Summary:")
print("==========================")
print(df)

# Save as CSV
df.to_csv("prompt_summary.csv", index=False)
print(f"
Saved to prompt_summary.csv")
