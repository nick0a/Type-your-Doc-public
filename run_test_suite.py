# Run document classification test suite

from doc_classifier.doc_classifier_test_suite import SimpleDocClassifier

def main():
    # Initialize the classifier
    classifier = SimpleDocClassifier(
        validation_data_path="doc_classifier/validated_dataset.csv",
        doc_folder="/Users/nicholasclarke/Downloads/DOCS/New Folder With Items",
        output_dir="classification_results",
        budget_limit=10.0
    )

    # Load the prompt from a file
    try:
        with open('prompt_template.txt', 'r') as f:
            prompt_template = f.read()
    except FileNotFoundError:
        print("Creating new prompt template file...")
        prompt_template = """You are an expert maritime document classification agent. Your task is to analyze and classify a given document into one of several predefined categories. Here's the document you need to classify:

<document_to_classify>
{{DOCUMENT_TO_CLASSIFY}}
</document_to_classify>

[Rest of your prompt template...]"""
        
        with open('prompt_template.txt', 'w') as f:
            f.write(prompt_template)
        print("Created prompt_template.txt - please edit this file with your full prompt")
        return

    # Get number of documents to test
    while True:
        try:
            num_docs = input("\nHow many documents to test? (number or 'all'): ")
            if num_docs.lower() == 'all':
                num_docs = None
                break
            num_docs = int(num_docs)
            if num_docs > 0:
                break
            print("Please enter a positive number")
        except ValueError:
            print("Please enter a valid number or 'all'")

    # Run the test
    classifier.test_prompt(prompt_template, num_docs)

if __name__ == "__main__":
    main()