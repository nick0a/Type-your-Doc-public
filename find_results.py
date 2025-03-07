import json
import os
import glob
import pandas as pd

# Print current directory for debugging
print(f"Current directory: {os.getcwd()}")

# Try different possible paths
possible_paths = [
    "optimization_results/prompt_test_*.json",
    "doc_classifier/optimization_results/prompt_test_*.json",
    "*/optimization_results/prompt_test_*.json",
    "*/*_results*.json",
    "doc_classifier/*_results*.json",
    "doc_classifier/*.json"
]

# Check for any JSON files to help locate them
print("\nSearching for result files...")
results = []
found_files = []

for path_pattern in possible_paths:
    files = glob.glob(path_pattern)
    if files:
        print(f"Found {len(files)} files matching pattern: {path_pattern}")
        found_files.extend(files)
        # Try to load each file
        for f in files:
            try:
                with open(f) as file:
                    data = json.load(file)
                    if "name" in data and "accuracy" in data:
                        results.append(data)
                        print(f"✓ Successfully loaded: {f}")
                    else:
                        print(f"✗ File doesn't contain prompt results: {f}")
            except Exception as e:
                print(f"✗ Error loading {f}: {e}")

# If we still didn't find anything, list all directories
if not found_files:
    print("\nNo result files found. Listing directories to help locate them:")
    for root, dirs, files in os.walk(".", topdown=True, followlinks=False):
        if ".git" in root or "__pycache__" in root:
            continue
        if root.startswith("./venv"):
            continue
        json_files = [f for f in files if f.endswith('.json')]
        if json_files:
            print(f"Directory with JSON files: {root}")
            print(f"  JSON files: {json_files}")

# Create results table if we found data
if results:
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
else:
    print("\nNo prompt test results found. Please check where the result files are located.")
    print("The script is looking for JSON files containing 'name' and 'accuracy' fields.")
