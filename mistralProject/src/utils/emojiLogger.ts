/**
 * Enhanced logger with emoji support for better visualization
 */
import { logger } from './logger';

/**
 * Emoji number representation for better progress visualization
 */
const numberEmojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

/**
 * Convert a number to emoji representation for better visual tracking
 */
export const getNumberEmoji = (num: number): string => {
  if (num < 10) {
    return numberEmojis[num];
  } else {
    // For numbers >= 10, convert each digit to emoji
    return num.toString().split('').map(digit => numberEmojis[parseInt(digit)]).join('');
  }
};

export const emojiLogger = {
  info: (message: string, ...args: any[]) => {
    logger.info(`🔍 ${message}`, ...args);
  },
  
  success: (message: string, ...args: any[]) => {
    logger.info(`✅ ${message}`, ...args);
  },
  
  warn: (message: string, ...args: any[]) => {
    logger.warn(`⚠️ ${message}`, ...args);
  },
  
  error: (message: string, ...args: any[]) => {
    logger.error(`❌ ${message}`, ...args);
  },
  
  debug: (message: string, ...args: any[]) => {
    logger.debug(`🔧 ${message}`, ...args);
  },
  
  ocr: (message: string, ...args: any[]) => {
    logger.info(`📝 OCR: ${message}`, ...args);
  },
  
  classify: (message: string, ...args: any[]) => {
    logger.info(`🔠 CLASSIFY: ${message}`, ...args);
  },
  
  extract: (message: string, ...args: any[]) => {
    logger.info(`📊 EXTRACT: ${message}`, ...args);
  },
  
  pipeline: (message: string, ...args: any[]) => {
    logger.info(`🔄 PIPELINE: ${message}`, ...args);
  },
  
  document: (message: string, ...args: any[]) => {
    logger.info(`📄 DOCUMENT: ${message}`, ...args);
  },
  
  startPhase: (phaseName: string, ...args: any[]) => {
    logger.info(`\n🚀 STARTING PHASE: ${phaseName} ${'-'.repeat(50)}`, ...args);
  },
  
  endPhase: (phaseName: string, ...args: any[]) => {
    logger.info(`✨ COMPLETED PHASE: ${phaseName} ${'-'.repeat(50)}`, ...args);
  },
  
  api: (message: string, ...args: any[]) => {
    logger.info(`🌐 API: ${message}`, ...args);
  },
  
  time: (message: string, timeMs: number, ...args: any[]) => {
    logger.info(`⏱️ TIME: ${message} - ${timeMs.toFixed(2)}ms`, ...args);
  },
  
  cost: (message: string, ...args: any[]) => {
    logger.info(`💰 COST: ${message}`, ...args);
  },
  
  progress: (current: number, total: number, message: string, ...args: any[]) => {
    const currentEmoji = getNumberEmoji(current);
    const totalEmoji = getNumberEmoji(total);
    logger.info(`${currentEmoji} of ${totalEmoji} ${message}`, ...args);
  },
  
  summarySection: (title: string) => {
    logger.info(`\n${'='.repeat(70)}`);
    logger.info(`🏆 ${title.toUpperCase()} 📊`);
    logger.info(`${'='.repeat(70)}`);
  },
  
  testConfig: (message: string, ...args: any[]) => {
    logger.info(`🔧 CONFIG: ${message}`, ...args);
  },
  
  apiCall: (message: string, ...args: any[]) => {
    logger.info(`🚀 API CALL: ${message}`, ...args);
  },
  
  apiResponse: (message: string, timeMs: number, ...args: any[]) => {
    logger.info(`⏱️ API RESPONSE: ${message} - ${timeMs.toFixed(2)}ms`, ...args);
  },
  
  retrying: (attempt: number, maxRetries: number, ...args: any[]) => {
    logger.warn(`🔁 RETRY ${attempt}/${maxRetries}`, ...args);
  },
  
  apiCallSuccess: (service: string, model: string, timeMs: number, cost: number) => {
    logger.info(`✅ API SUCCESS: ${service} (${model}) - ${timeMs.toFixed(2)}ms - $${cost.toFixed(6)}`);
  },
  
  apiCallFailure: (service: string, model: string, error: string) => {
    logger.error(`❌ API FAILURE: ${service} (${model}) - Error: ${error}`);
  },
  
  apiCallStats: (totalCalls: number, successRate: number, avgTime: number, totalCost: number) => {
    logger.info(`📊 API STATS: ${totalCalls} calls, ${(successRate * 100).toFixed(1)}% success rate, avg ${avgTime.toFixed(2)}ms, $${totalCost.toFixed(6)} total`);
  },
  
  progressBar: (current: number, total: number, label: string = '', width: number = 20) => {
    const percent = Math.floor((current / total) * 100);
    const filledWidth = Math.floor((current / total) * width);
    const emptyWidth = width - filledWidth;
    
    const filledBar = '▓'.repeat(filledWidth);
    const emptyBar = '░'.repeat(emptyWidth);
    
    logger.info(`${label} [${filledBar}${emptyBar}] ${percent}% (${current}/${total})`);
  },
  
  resultSummary: (correct: number, total: number, message: string = '') => {
    const accuracy = (correct / total) * 100;
    const emoji = accuracy >= 90 ? '🔥' : accuracy >= 70 ? '👍' : accuracy >= 50 ? '👌' : '🤔';
    logger.info(`${emoji} RESULTS: ${correct}/${total} correct (${accuracy.toFixed(2)}%) ${message}`);
  },
  
  jsonSummary: (obj: any, label: string = 'SUMMARY') => {
    logger.info(`📋 ${label}: ${JSON.stringify(obj, null, 2)}`);
  },
  
  timerStart: (label: string) => {
    const startTime = Date.now();
    return () => {
      const elapsed = Date.now() - startTime;
      logger.info(`⏱️ TIMER: ${label} completed in ${elapsed}ms`);
      return elapsed;
    };
  }
};

export default emojiLogger; 