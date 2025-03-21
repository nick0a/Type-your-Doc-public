#!/usr/bin/env python3
# aggregate_flash_lite.py
# Purpose: Creates an aggregated report from the Flash Lite test results

import json
import glob
from datetime import datetime

def aggregate_results():
    """Aggregate results from Flash Lite test runs"""
    # Find all result files from the recent Flash Lite tests
    result_files = [
        "gemini_vision_classification_results_20250321_112633.json",
        "gemini_vision_classification_results_20250321_112551.json",
        "gemini_vision_classification_results_20250321_112510.json",
        "gemini_vision_classification_results_20250321_112426.json",
        "gemini_vision_classification_results_20250321_112344.json",
        "gemini_vision_classification_results_20250321_112301.json"
    ]
    
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
    total_run_times = []
    detailed_results_by_file = {}
    
    for run in all_runs:
        summary = run.get("summary", {})
        accuracies.append(summary.get("accuracy", 0))
        completion_percentages.append(summary.get("completion_percentage", 0))
        response_times.append(summary.get("average_response_time", 0))
        total_costs.append(summary.get("total_cost", 0))
        total_tokens.append(summary.get("total_tokens", {}).get("total", 0))
        total_run_times.append(summary.get("total_run_time", 0))
        
        # Collect results by file for consistency analysis
        for result in run.get("detailed_results", []):
            filename = result.get("filename")
            if filename:
                if filename not in detailed_results_by_file:
                    detailed_results_by_file[filename] = []
                detailed_results_by_file[filename].append({
                    "predicted": result.get("predicted", ""),
                    "expected": result.get("expected", ""),
                    "correct": result.get("correct", False),
                    "response_time": result.get("response_time", 0),
                    "cost": result.get("cost", 0)
                })
    
    # Calculate aggregate statistics
    avg_accuracy = sum(accuracies) / len(accuracies) if accuracies else 0
    avg_completion = sum(completion_percentages) / len(completion_percentages) if completion_percentages else 0
    avg_response_time = sum(response_times) / len(response_times) if response_times else 0
    avg_run_time = sum(total_run_times) / len(total_run_times) if total_run_times else 0
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
        
        # Calculate average response time for this file
        avg_file_response_time = sum(r.get("response_time", 0) for r in results) / len(results) if results else 0
        
        consistency_by_file[filename] = {
            "most_common_prediction": most_common[0],
            "consistency_percentage": consistency_percentage,
            "expected": results[0].get("expected") if results else "",
            "correct_percentage": sum(1 for r in results if r.get("correct", False)) / len(results) * 100 if results else 0,
            "avg_response_time": avg_file_response_time
        }
    
    # Generate timestamp for aggregated results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Create aggregated results
    aggregated_results = {
        "timestamp": timestamp,
        "num_runs": len(all_runs),
        "model": "gemini-2.0-flash-lite",
        "summary": {
            "average_accuracy": avg_accuracy,
            "average_completion_percentage": avg_completion,
            "average_response_time": avg_response_time,
            "average_run_time": avg_run_time,
            "total_cost_all_runs": total_cost_all_runs,
            "average_cost_per_run": avg_cost_per_run,
            "total_tokens_all_runs": total_tokens_all_runs,
            "average_tokens_per_run": avg_tokens_per_run,
            "accuracies_by_run": accuracies,
            "completion_percentages_by_run": completion_percentages,
            "response_times_by_run": response_times,
            "costs_by_run": total_costs,
            "run_times_by_run": total_run_times
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
    print(f"🏆 AGGREGATED RESULTS SUMMARY ({len(all_runs)} RUNS) - GEMINI 2.0 FLASH LITE")
    print("="*70)
    print(f"📊 Average Accuracy: {avg_accuracy:.2%}")
    print(f"🔄 Average Completion: {avg_completion:.2f}%")
    print(f"⏱️ Average Response Time: {avg_response_time:.2f} seconds")
    print(f"⏱️ Average Run Time: {avg_run_time:.2f} seconds")
    print(f"💰 Total Cost (all runs): ${total_cost_all_runs:.6f}")
    print(f"💰 Average Cost per Run: ${avg_cost_per_run:.6f}")
    print(f"🔤 Total Tokens (all runs): {total_tokens_all_runs}")
    print(f"🔤 Average Tokens per Run: {avg_tokens_per_run:.1f}")
    print(f"💾 Aggregated results saved to: {output_file}")
    print("="*70)
    
    # Print consistency analysis
    print("\n📋 CONSISTENCY ANALYSIS (by file):")
    print(f"{'FILENAME':<40} | {'CONSISTENCY':<12} | {'CORRECTNESS':<12} | {'AVG TIME (s)':<12} | {'EXPECTED':<20} | {'MOST COMMON PREDICTION':<20}")
    print("-"*120)
    
    for filename, analysis in consistency_by_file.items():
        print(f"{filename:<40} | {analysis['consistency_percentage']:.1f}% | {analysis['correct_percentage']:.1f}% | {analysis['avg_response_time']:.2f} | {analysis['expected']:<20} | {analysis['most_common_prediction']:<20}")
    
    return aggregated_results

if __name__ == "__main__":
    aggregate_results() 