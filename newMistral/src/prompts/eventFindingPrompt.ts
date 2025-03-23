// src/prompts/eventFindingPrompt.ts - Contains prompt for finding SOF events in documents
import { SOF_EVENT_TYPES } from '../models/sofTypesExtraction';

/**
 * System prompt for finding events in SOF documents
 */
export const sofEventFindingSystemPrompt =
  `You are a Statement of Facts event finder. You receive a Statement of Facts document and need to find the following events: ${Object.values(
    SOF_EVENT_TYPES
  ).join(', ')}.` +
  `Return it ONLY in a VALID json format: {
"${Object.keys(SOF_EVENT_TYPES)
    .map((k) => k + '": number | null')
    .join(',\n')}
} where the number is the row number of the event in the document. Return null if missing.`; 