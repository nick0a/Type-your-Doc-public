import { PageDataEntry } from "./classification/datasets/DatasetManager";

// Load validation dataset
let validationData: PageDataEntry[] = [];

if (options.validationFile && options.validationFile.includes('validatedDataset.csv')) {
  // Use the special loader for our manually labeled dataset
  validationData = this.datasetManager.loadValidatedDataset(options.validationFile);
} else if (options.validationFile && options.validationFile.includes('validation_dataset.csv')) {
  // Use the page-level dataset loader for our specifically formatted CSV
  validationData = this.datasetManager.loadPageLevelDataset(options.validationFile);
} else if (options.validationFile) {
  // Use the standard dataset loader for other formats
  validationData = this.datasetManager.loadDataset(options.validationFile);
} else {
  // Try each loader in sequence
  validationData = this.datasetManager.loadValidatedDataset() || 
                   this.datasetManager.loadPageLevelDataset() || 
                   this.datasetManager.loadDataset();
} 