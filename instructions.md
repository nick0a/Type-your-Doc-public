
1. Run a prompt against 5 random documents to determine their types.

2. If it is successul run it against 10 random documents to determine their type.

3. If it is successful run it against 20 random documents to determine their type.

4. If it is successful run it against 20 random documents to determine their type.

5. If it is successful run it against 40 random documents to determine their type.

6. If it is successful run it against 80 random documents to determine their type.

7. If it is successful run it against 160 random documents to determine their type.

IF AT ANY POINT THE NUMBER OF DOCUMENTS IN THE DATASET IS LESS THEN THE NUMBER OF DOCUMENTS IN THE INSTRUCTION, THEN PROCESS THOSE DOCUMENTS, THEN STOP.

Whenever a prompt is run on a document track the results in a table that tracks the prompt the documents it was run against, and the outcome ()Boolean Correcxt: true/false

Ensure the table is easy to read for the user.

If at any point it is not successful, re-engineer the prompt and start again at step 1.

When re-engineering prompts review the most successful prompts in the dataset of tests to assess which techniques work the best.

Repeat until you hit the COST_CHECKPOINT vvalue or untiol you reach 100% pass across all documents.

