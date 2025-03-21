#!/bin/bash
# First, ensure the TypeScript code is compiled
cd typescript_doc_classifier
echo "Compiling TypeScript code..."
npm run build

# Check if compilation was successful
if [ ! -f ./dist/index.js ]; then
  echo "Compilation failed or dist/index.js doesn't exist!"
  exit 1
fi

# Create an expect script to handle the interactive prompts
cat > run_interactive.exp << 'EOF'
#!/usr/bin/expect -f
# This expect script handles the interactive prompts from the document classifier

# Set a reasonable timeout
set timeout 300

# Start the node program
spawn node ./dist/index.js

# Wait for the model selection prompt and send "2"
expect "Choose a model" {
    send "2\r"
}

# Wait for the document count prompt and send "10"
expect "How many documents would you like to test? (1-106, or 'all')" {
    send "10\r"
}

# Wait for the concurrent processing prompt and send "10"
expect "How many documents would you like to process concurrently? (1-10, default: 1)" {
    send "10\r"
}

# Wait for the program to finish
expect eof
EOF

# Make the expect script executable
chmod +x run_interactive.exp

# Run the automated tests
echo "Starting automated test runs..."
for i in {1..10}; do
  echo "Run $i of 10"
  
  # Run the expect script
  ./run_interactive.exp
  
  echo "Run $i completed."
  
  if [ $i -lt 10 ]; then
    echo "Waiting 1 minute before next run..."
    sleep 60
  fi
done

# Clean up
rm run_interactive.exp

echo "All runs completed." 