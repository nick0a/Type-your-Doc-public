#!/bin/bash
# A fresh approach to run the TypeScript document classifier
# This script compiles the TypeScript code first, then runs the compiled JavaScript

# Change to the typescript_doc_classifier directory
cd typescript_doc_classifier

# Ensure the code is compiled
echo "Compiling TypeScript code..."
npm run build

# Check if compilation was successful
if [ ! -f ./dist/index.js ]; then
  echo "Compilation failed or dist/index.js doesn't exist!"
  exit 1
fi

# Run the automated tests
echo "Starting automated test runs..."
for i in {1..10}; do
  echo "Run $i of 10"
  # Run the compiled JavaScript directly with Node.js
  # Provide input in the exact order the program expects:
  # 1. Model choice (2 for Gemini 2.0 Flash)
  # 2. Number of documents (10)
  # 3. Number of concurrent workers (10)
  cat <<EOF | node ./dist/index.js
2
10
10
EOF
  echo "Run $i completed."
  
  if [ $i -lt 10 ]; then
    echo "Waiting 1 minute before next run..."
    sleep 60
  fi
done

echo "All runs completed." 