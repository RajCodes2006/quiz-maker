export type CsvRecord = { cells: string[]; line: number };

export type CsvParseResult = {
  records: CsvRecord[];
  error?: string;
};

/**
 * Strict CSV parser supporting quoted commas, escaped quotes and multiline fields.
 * It rejects characters after a closing quote instead of silently changing data.
 */
export function parseCsv(input: string): CsvParseResult {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  let line = 1;
  let recordLine = 1;

  const finishRecord = () => {
    cells.push(field);
    if (cells.some((value) => value.trim() !== "")) {
      records.push({ cells, line: recordLine });
    }
    cells = [];
    field = "";
    afterQuote = false;
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += char;
        if (char === "\n") line += 1;
      }
      continue;
    }

    if (afterQuote) {
      if (char === ",") {
        cells.push(field);
        field = "";
        afterQuote = false;
      } else if (char === "\n" || char === "\r") {
        finishRecord();
        if (char === "\r" && input[i + 1] === "\n") i += 1;
        line += 1;
        recordLine = line;
      } else {
        return {
          records: [],
          error: "Unexpected character after a closing quote near line " + line
        };
      }
      continue;
    }

    if (char === '"') {
      if (field.length !== 0) {
        return { records: [], error: "Unexpected quote in CSV near line " + line };
      }
      inQuotes = true;
    } else if (char === ",") {
      cells.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      finishRecord();
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      line += 1;
      recordLine = line;
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    return { records: [], error: "A quoted field was not closed." };
  }

  cells.push(field);
  if (cells.some((value) => value.trim() !== "")) {
    records.push({ cells, line: recordLine });
  }

  return { records };
}
