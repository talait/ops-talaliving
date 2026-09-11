/** Splitting a CSV line, quotes included.
 *
 *  Written because the naive `line.split(",")` broke on the first real file it
 *  met: the company's overtime form exported from a spreadsheet quotes any
 *  field containing a comma, so `"105,000"` arrived as two cells and pushed
 *  every column after it one to the left — the hours landed in the signature
 *  column and the row read as *Rp 105 for 0 hours* (F47).
 *
 *  A whole CSV library is not the answer to that; the answer is fifteen lines
 *  that respect quotes, including the doubled `""` that means a literal quote
 *  inside a quoted field. Everything else in these exports — newlines inside
 *  cells, different separators — this deliberately does not handle, because it
 *  has not happened and inventing for it would hide the day it does.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      out.push(cell);
      cell = "";
    } else {
      cell += c;
    }
  }
  out.push(cell);
  return out;
}

/** The whole file, line by line, quotes respected. Blank lines are dropped —
 *  in a form export they are the rows nobody filled in. */
export function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map(splitCsvLine);
}
