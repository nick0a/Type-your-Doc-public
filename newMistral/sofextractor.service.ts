import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

// SOF AI Extraction

// Updated Prompt

export const aiExtractSystemPrompt = `You must respond ONLY with a JSON object with no explanation or markdown formatting.

Your task is to extract ONLY the Statement of Facts (SOF) events from maritime shipping documents. These events represent key operational milestones of a vessel's port call.

DEFINITION OF SOF EVENT:
An SOF event MUST contain:
1. An event description/name (e.g., "NOR Tendered", "Anchor Aweigh", "Cargo Commenced")
2. Either a time or time range, and/or a date.
3. Some SOF entries will not have a date, as it is expected the user will infer the date from the previous event.

IDENTIFYING THE MAIN SOF TABLE:
- Look for structured tables with rows containing event descriptions and corresponding times/dates
- The main SOF table typically contains multiple chronological entries showing vessel operations
- Often has column headers like "Event", "Description", "Date", "Time", "Remarks"
- An exception to these guidelines is that BIMCO Standard SOF documents will contain event, date and time data in a box format. In this case, the event is the text in the box and the date and time are the date and time of the box.

WHAT TO INCLUDE:
- Only extract entries main operational events table/s.
- Include events that represent vessel operations, cargo operations, or official notifications
- Maintain chronological integrity of the sequence of events

WHAT TO EXCLUDE:
- Do NOT extract header information about the vessel, voyage, or port
- Do NOT extract signatures, stamps, or certification text
- Do NOT extract reference information, cargo quantities, or notes unless they are part of an event
- Do NOT extract isolated text that doesn't represent a discrete vessel operation event
- Do NOT extract table headers as events

Here is the required JSON structure for your output:

{
  "data": [
    {
      "event": "string",
      "date": "YYYY-MM-DD or null",
      "time": "HHmm or null",
      "timeFrame": {
        "start": "HHmm or null",
        "end": "HHmm or null"
      },
      "hasHandwritten": true or false
    }
  ]
}

Your task is to examine the SOF document image and:
1. Identify and extract all relevant events with their details
2. Format the data according to the JSON structure above

Guidelines:

1. Date/Time Formats:
   - Use 24-hour format (HHmm) for all time entries.
   - Use YYYY-MM-DD for all dates.

2. Event Separation
   - For each json entry ensure that is reflects the data that is entered in a row or box. Keep event entries separate.

3. Start and End Times:
   - If an event contains both start and end times then include them.
   - If only a single time is defined for an event, update the start time and leave the end time as null.

4. Multi-day Entries: Capture the full duration for events spanning multiple days.

5. Assumed Date Propagation: In tables, when date entries are blank, use the most recently stated date in an above row until a new date is specified.

6. Partial Information: For missing data, leave the corresponding JSON fields empty.

7. Handwriting: Add a "handwritten" flag (set to true) for events containing handwritten content.

8. Event Separation: Maintain separate events as they appear in the SOF document. Do not conflate multiple events into one.

JSON VALIDATION REQUIREMENTS:
Before finalizing your response, carefully validate your JSON for the following:
- All opening brackets { [ have matching closing brackets } ]
- All strings are properly enclosed with double quotes
- All objects and arrays are correctly terminated
- No trailing commas exist in arrays or objects
- No comments exist in the JSON
- All property names are enclosed in double quotes
- The entire structure is valid JSON that can be parsed without errors

RESPONSE FORMAT:
- Your response must begin with the character "{" and end with the character "}" with no other characters, spaces, or line breaks before or after
- Do not use markdown code blocks or any other formatting
- Do not include any explanatory text before or after the JSON
- Ensure your JSON has balanced quotes, brackets, and braces

EXAMPLES OF VALID RESPONSES:

Example 1: Single time event
{
  "data": [
    {
      "event": "NOR Tendered",
      "date": "YYYY-MM-DD",
      "time": "HHmm",
      "timeFrame": {
        "start": null,
        "end": null
      },
      "hasHandwritten": false
    }
  ]
}

Example 2: Time range event
{
  "data": [
    {
      "event": "Cargo Operations",
      "date": "YYYY-MM-DD",
      "time": null,
      "timeFrame": {
        "start": "HHmm",
        "end": "HHmm"
      },
      "hasHandwritten": false
    }
  ]
}

Example 3: Multiple events in sequence
{
  "data": [
    {
      "event": "Pilot on board",
      "date": "YYYY-MM-DD",
      "time": "HHmm",
      "timeFrame": {
        "start": null,
        "end": null
      },
      "hasHandwritten": false
    },
    {
      "event": "All fast",
      "date": "YYYY-MM-DD",
      "time": "HHmm",
      "timeFrame": {
        "start": null,
        "end": null
      },
      "hasHandwritten": false
    },
    {
      "event": "Cargo operations",
      "date": "YYYY-MM-DD",
      "time": null,
      "timeFrame": {
        "start": "HHmm",
        "end": "HHmm"
      },
      "hasHandwritten": false
    }
  ]
}

IMPORTANT: Your entire response must be a single valid JSON object with no surrounding text or explanation. Do not use markdown code blocks, do not add any explanatory text before or after the JSON, and make sure all property names have double quotes.

FINAL VALIDATION:
Before submitting your response, verify that:
1. The JSON is complete with no truncation
2. All syntax is valid with no errors
3. The output matches exactly the required structure
4. The total number of extracted events is reasonable (if more than 30 events, verify you haven't duplicated entries)
5. The chronological sequence of events makes logical sense.`;

// Original Prompt

// export const aiExtractSystemPrompt = `You must respond ONLY with a JSON object with no explanation or markdown formatting.
//
// Your task is to extract ONLY the Statement of Facts (SOF) events from maritime shipping documents. These events represent key operational milestones of a vessel's port call.
//
// DEFINITION OF SOF EVENT:
// An SOF event MUST contain:
// 1. An event description/name (e.g., "NOR Tendered", "Anchor Aweigh", "Cargo Commenced")
// 2. Either a time or time range, and/or a date.
// 3. Some SOF entries will not have a date, as it is expected the user will infer the date from the previous event.

// IDENTIFYING THE MAIN SOF TABLE:
// - Look for structured tables with rows containing event descriptions and corresponding times/dates
// - The main SOF table typically contains multiple chronological entries showing vessel operations
// - Often has column headers like "Event", "Description", "Date", "Time", "Remarks"
// - An exception to these guidelines is that BIMCO Standard SOF documents will contain event, date and time data in a box format.  In this case, the event is the text in the box and the date and time are the date and time of the box.

// WHAT TO INCLUDE:
// - Only extract entries main operational events table/s.
// - Include events that represent vessel operations, cargo operations, or official notifications
// - Maintain chronological integrity of the sequence of events

// WHAT TO EXCLUDE:
// - Do NOT extract header information about the vessel, voyage, or port
// - Do NOT extract signatures, stamps, or certification text
// - Do NOT extract reference information, cargo quantities, or notes unless they are part of an event
// - Do NOT extract isolated text that doesn't represent a discrete vessel operation event
// - Do NOT extract table headers as events

// Here is the required JSON structure for your output:

// {
//   "data": [
//     {
//       "event": "string",
//       "date": "YYYY-MM-DD or null",
//       "time": "HHmm or null",
//       "timeFrame": {
//         "start": "HHmm or null",
//         "end": "HHmm or null"
//       },
//       "hasHandwritten": true or false
//     }
//   ]
// }

// Your task is to examine the SOF document image and:
// 1. Identify and extract all relevant events with their details
// 2. Format the data according to the JSON structure above

// Guidelines:

// 1. Date/Time Formats:
//   - Use 24-hour format (HH:MM) for all time entries.
//   - Use YYYY-MM-DD for all dates.

// 2. Event Separation
//   - For each json entry ensure that is reflects the data that is entered in a row or box.  Keep event entries separate.

// 2. Start and End Times:
//   - If an event contains both start and end times then include them.
//   - If only a single time is defined for an event, update the start time and leave the end time as null.

// 3. Multi-day Entries: Capture the full duration for events spanning multiple days.

// 4. Assumed Date Propagation: In tables, when date entries are blank, use the most recently stated date in an above row until a new date is specified.

// 5. Partial Information: For missing data, leave the corresponding JSON fields empty.

// 6. Handwriting: Add a "handwritten" flag (set to true) for events containing handwritten content.

// 7. Event Separation: Maintain separate events as they appear in the SOF document. Do not conflate multiple events into one.

// IMPORTANT: Your entire response must be a single valid JSON object with no surrounding text or explanation. Do not use markdown code blocks, do not add any explanatory text before or after the JSON, and make sure all property names have double quotes.`;

export class TimeFrame {
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'Time must be in HHmm format',
  })
  start: string | null;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'Time must be in HHmm format',
  })
  end: string | null;
}

export class SofAiExtractRow {
  @IsString()
  @IsNotEmpty()
  event: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date must be in YYYY-MM-DD format',
  })
  @IsOptional()
  date: string | null;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'Time must be in HHmm format',
  })
  time: string | null;

  @ValidateNested()
  @Type(() => TimeFrame)
  @IsOptional()
  timeFrame: TimeFrame | null;

  @IsBoolean()
  hasHandwritten: boolean;
}

export class SofAiExtractResult {
  @ValidateNested()
  @IsArray()
  @Type(() => SofAiExtractRow)
  data: SofAiExtractRow[];
}

// SOF Event finding

export enum SOF_EVENT_TYPES {
  NOR_TENDERED = 'Notice of Readiness (NOR) Tendered',
  DROP_ANCHOR = 'Drop Anchor',
  ANCHOR_AWEIGH = 'Anchor Aweigh',
  MADE_FAST = 'Made Fast',
  CUSTOMS_CLEARED = 'Customs Cleared',
  FREE_PRATIQUE_GRANTED = 'Free Pratique Granted',
  CARGO_HOSE_CONNECTED = 'Cargo Hose Connected',
  CARGO_HOSE_DISCONNECTED = 'Cargo Hose Disconnected',
  GANGWAY_DONE = 'Gangway Done',
  COMMENCE_CARGO_LOADING = 'Commence Cargo Loading',
  COMMENCE_CARGO_DISCHARGE = 'Commence Cargo Discharge',
}

export const sofEventFindingSystemPrompt =
  `You are a Statement of Facts event finder. You receive a Statement of Facts document and need to find the following events: ${Object.values(
    SOF_EVENT_TYPES
  ).join(', ')}.` +
  `Return it ONLY in a VALID json format: {
"${Object.keys(SOF_EVENT_TYPES)
    .map((k) => k + '": number | null')
    .join(',\n')}
} where the number is the row number of the event in the document. Return null if missing.`;

// Other Models

export class SofExtractRow {
  event: string;
  date: string | null;
  time: string | null;
  timeFrame: TimeFrame | null;
  hasHandwritten: boolean;

  editedDate: string | null;
  editedTime: string | null;
  editedTimeFrame: TimeFrame | null;
  rowNum: number;
}

export class SofExtractTable {
  rows: SofExtractRow[];
}

export type SofExtractEditableRow = Pick<
  SofExtractRow,
  'rowNum' | 'editedDate' | 'editedTime' | 'editedTimeFrame'
>;

export type SofComparisonTable = {
  [k: string]: {
    masterSofRowNum: number | null;
    agentSofRowNum: number | null;
  };
};

function sofAiExtractsToExtractTable(
  aiExtracts: SofAiExtractRow[]
): SofExtractTable {
  return aiExtracts.reduce(
    (acc, aiExtract, i) => {
      acc.rows.push({
        rowNum: i,
        event: aiExtract.event,
        date: aiExtract.date,
        time: aiExtract.time?.slice(0, 4) ?? aiExtract.timeFrame?.end ?? null,
        timeFrame: aiExtract.timeFrame,
        hasHandwritten: aiExtract.hasHandwritten,
        editedDate: null,
        editedTime: null,
        editedTimeFrame: null,
      });
      return acc;
    },
    { rows: [] } as SofExtractTable
  );
}

function mergeSofExtractTablesWithEdits(
  table: SofExtractTable | null,
  editRows: SofExtractEditableRow[] | undefined
): SofExtractTable | null {
  if (!table) {
    return null;
  }
  if (!editRows || editRows.length === 0) {
    return table;
  }

  const editRowsMap = editRows.reduce((acc, editRow) => {
    acc[editRow.rowNum] = editRow;
    return acc;
  }, {} as { [rowNum: number]: SofExtractEditableRow });

  return {
    rows: table.rows.map((row) => {
      const editRow = editRowsMap[row.rowNum];
      if (!editRow) {
        return row;
      } else {
        return {
          ...row,
          editedDate: editRow.editedDate,
          editedTime: editRow.editedTime,
          editedTimeFrame: editRow.editedTimeFrame,
        };
      }
    }),
  } satisfies SofExtractTable;
}

export const debugDir = process.env.DEBUG_DIR || '/app/data/debug-sof-extraction';

// Batch processing configuration
export const SOF_BATCH_SIZE = parseInt(process.env.SOF_BATCH_SIZE || '2', 10);
export const SOF_MAX_CONCURRENCY = parseInt(process.env.SOF_MAX_CONCURRENCY || '4', 10);
export const SOF_MAX_RETRIES = parseInt(process.env.SOF_MAX_RETRIES || '3', 10);
export const SOF_RETRY_DELAY_MS = parseInt(process.env.SOF_RETRY_DELAY_MS || '500', 10);
