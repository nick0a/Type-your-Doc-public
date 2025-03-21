#!/usr/bin/env python3
# run_tests.py
# Purpose: Runs the vision document classifier multiple times and aggregates results

import subprocess
import time
import json
import os
from datetime import datetime
import glob

def run_test(test_num):
    """Run a single test of the document classifier"""
    print(f"\n{'='*50}")
    print(f"RUNNING TEST #{test_num}/10")
    print(f"{'='*50}")
    
    # Create input for the subprocess that answers the prompts
    input_text = (
        "3\n"  # Select Gemini 2.0 Flash Lite (option 3)
        "10\n"  # Process 10 documents
        "10\n"  # Process 10 documents concurrently
        "y\n"   # Confirm high concurrency
    )
    
    # Run the document classifier
    process = subprocess.Popen(
        ["python3", "vision_doc_classifier_gemini_👁️.py"],
        stdin=subprocess.PIPE,
        text=True
    )
    
    # Send input to the process
    process.communicate(input_text)
    
    # Wait for process to complete
    process.wait()
    
    print(f"\nTest #{test_num} completed!")

def aggregate_results():
    """Aggregate results from all test runs"""
    # Find all result files
    result_files = glob.glob("gemini_vision_classification_results_*.json")
    
    if not result_files:
        print("No result files found!")
        return
    
    # Sort files by timestamp to get most recent 10
    result_files.sort(reverse=True)
    result_files = result_files[:10]
    
    print(f"Found {len(result_files)} result files for analysis")
    
    # Collect data from all runs
    all_runs = []
    
    for file_path in result_files:
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                all_runs.append(data)
            print(f"Loaded: {file_path}")
        except Exception as e:
            print(f"Error loading {file_path}: {e}")
    
    # Extract summary data
    accuracies = []
    completion_percentages = []
    response_times = []
    total_costs = []
    total_tokens = []
    detailed_results_by_file = {}
    
    for run in all_runs:
        summary = run.get("summary", {})
        accuracies.append(summary.get("accuracy", 0))
        completion_percentages.append(summary.get("completion_percentage", 0))
        response_times.append(summary.get("average_response_time", 0))
        total_costs.append(summary.get("total_cost", 0))
        total_tokens.append(summary.get("total_tokens", {}).get("total", 0))
        
        # Collect results by file for consistency analysis
        for result in run.get("detailed_results", []):
            filename = result.get("filename")
            if filename:
                if filename not in detailed_results_by_file:
                    detailed_results_by_file[filename] = []
                detailed_results_by_file[filename].append({
                    "predicted": result.get("predicted", ""),
                    "expected": result.get("expected", ""),
                    "correct": result.get("correct", False)
                })
    
    # Calculate aggregate statistics
    avg_accuracy = sum(accuracies) / len(accuracies) if accuracies else 0
    avg_completion = sum(completion_percentages) / len(completion_percentages) if completion_percentages else 0
    avg_response_time = sum(response_times) / len(response_times) if response_times else 0
    total_cost_all_runs = sum(total_costs)
    avg_cost_per_run = total_cost_all_runs / len(total_costs) if total_costs else 0
    total_tokens_all_runs = sum(total_tokens)
    avg_tokens_per_run = total_tokens_all_runs / len(total_tokens) if total_tokens else 0
    
    # Analyze consistency
    consistency_by_file = {}
    for filename, results in detailed_results_by_file.items():
        # Count occurrences of each prediction
        predictions = {}
        for result in results:
            pred = result.get("predicted")
            if pred:
                predictions[pred] = predictions.get(pred, 0) + 1
        
        # Get the most common prediction and its count
        most_common = max(predictions.items(), key=lambda x: x[1]) if predictions else ("", 0)
        consistency_percentage = (most_common[1] / len(results)) * 100 if results else 0
        
        consistency_by_file[filename] = {
            "most_common_prediction": most_common[0],
            "consistency_percentage": consistency_percentage,
            "expected": results[0].get("expected") if results else "",
            "correct_percentage": sum(1 for r in results if r.get("correct", False)) / len(results) * 100 if results else 0
        }
    
    # Generate timestamp for aggregated results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Create aggregated results
    aggregated_results = {
        "timestamp": timestamp,
        "num_runs": len(all_runs),
        "summary": {
            "average_accuracy": avg_accuracy,
            "average_completion_percentage": avg_completion,
            "average_response_time": avg_response_time,
            "total_cost_all_runs": total_cost_all_runs,
            "average_cost_per_run": avg_cost_per_run,
            "total_tokens_all_runs": total_tokens_all_runs,
            "average_tokens_per_run": avg_tokens_per_run,
            "accuracies_by_run": accuracies,
            "completion_percentages_by_run": completion_percentages,
            "response_times_by_run": response_times,
            "costs_by_run": total_costs
        },
        "consistency_analysis": {
            "by_file": consistency_by_file
        }
    }
    
    # Save aggregated results
    output_file = f"aggregated_results_flash_lite_{timestamp}.json"
    with open(output_file, "w") as f:
        json.dump(aggregated_results, f, indent=2)
    
    # Print summary to console
    print("\n" + "="*70)
    print(f"🏆 AGGREGATED RESULTS SUMMARY (10 RUNS) - GEMINI 2.0 FLASH LITE")
    print("="*70)
    print(f"📊 Average Accuracy: {avg_accuracy:.2%}")
    print(f"🔄 Average Completion: {avg_completion:.2f}%")
    print(f"⏱️ Average Response Time: {avg_response_time:.2f} seconds")
    print(f"💰 Total Cost (all runs): ${total_cost_all_runs:.6f}")
    print(f"💰 Average Cost per Run: ${avg_cost_per_run:.6f}")
    print(f"🔤 Total Tokens (all runs): {total_tokens_all_runs}")
    print(f"🔤 Average Tokens per Run: {avg_tokens_per_run:.1f}")
    print(f"💾 Aggregated results saved to: {output_file}")
    print("="*70)
    
    # Print consistency analysis
    print("\n📋 CONSISTENCY ANALYSIS (by file):")
    print(f"{'FILENAME':<40} | {'CONSISTENCY':<12} | {'CORRECTNESS':<12} | {'EXPECTED':<20} | {'MOST COMMON PREDICTION':<20}")
    print("-"*110)
    
    for filename, analysis in consistency_by_file.items():
        print(f"{filename:<40} | {analysis['consistency_percentage']:.1f}% | {analysis['correct_percentage']:.1f}% | {analysis['expected']:<20} | {analysis['most_common_prediction']:<20}")
    
    return aggregated_results

def main():
    """Run tests and aggregate results"""
    # Run 10 tests with 30 second delay between tests
    for i in range(1, 11):
        run_test(i)
        
        # Wait 30 seconds between tests (except after the last test)
        if i < 10:
            print(f"Waiting 30 seconds before the next test...")
            time.sleep(30)
    
    # Aggregate results
    print("\nAll tests completed! Aggregating results...")
    aggregate_results()

if __name__ == "__main__":
    main() 