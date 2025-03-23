/**
 * readlineUtils.ts
 * Provides a shared readline interface for user input
 * with special handling for numeric input to prevent keystroke duplication issues
 */
import * as readline from 'readline';

// Single shared readline interface instance
let sharedRl: readline.Interface | null = null;

/**
 * Get the shared readline interface
 */
export function getReadlineInterface(): readline.Interface {
  if (!sharedRl) {
    sharedRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });
    
    // Handle application exit to properly close readline
    process.on('exit', () => {
      if (sharedRl) {
        sharedRl.close();
        sharedRl = null;
      }
    });
  }
  
  return sharedRl;
}

/**
 * Close the shared readline interface
 */
export function closeReadline(): void {
  if (sharedRl) {
    sharedRl.close();
    sharedRl = null;
  }
}

/**
 * Get user input with special handling for numeric input
 * to prevent keystroke duplication issues
 */
export async function getUserInput(prompt: string, defaultValue?: string): Promise<string> {
  const rl = getReadlineInterface();
  
  return new Promise((resolve) => {
    rl.question(`${prompt}${defaultValue ? ` (default: ${defaultValue})` : ''}: `, (answer) => {
      // Deduplicate sequential identical digits (fixes keyboard input duplication)
      const deduplicatedAnswer = answer.replace(/(\d)\1+/g, '$1');
      
      // Trim the answer to remove any extra spaces
      const trimmedAnswer = deduplicatedAnswer.trim();
      resolve(trimmedAnswer || defaultValue || '');
    });
  });
} 