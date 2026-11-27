import assert from "node:assert/strict";
import testCase from "node:test";
import { parseCsv } from "../lib/csv.ts";

testCase("parses ordinary CSV and ignores blank lines", () => {
  const result = parseCsv("name,option\nFirst,A\n\nSecond,B\n");
  assert.equal(result.error, undefined);
  assert.deepEqual(result.records.map((row) => row.cells), [
    ["name", "option"],
    ["First", "A"],
    ["Second", "B"]
  ]);
});

testCase("supports quoted commas and escaped quotes", () => {
  const result = parseCsv('question,option\n"Which, one?","Say ""hello"""');
  assert.equal(result.error, undefined);
  assert.deepEqual(result.records[1].cells, ["Which, one?", 'Say "hello"']);
});

testCase("supports line breaks inside quoted fields and tracks rows", () => {
  const result = parseCsv('question,option\n"First line\nsecond line",A\nNext,B');
  assert.equal(result.error, undefined);
  assert.deepEqual(result.records[1], {
    cells: ["First line\nsecond line", "A"],
    line: 2
  });
  assert.equal(result.records[2].line, 4);
});

testCase("rejects characters after a closing quote", () => {
  const result = parseCsv('question,option\n"quoted"oops,A');
  assert.match(result.error ?? "", /after a closing quote/);
  assert.equal(result.records.length, 0);
});

testCase("rejects quotes inside unquoted fields", () => {
  const result = parseCsv('question,option\nnot"quoted,A');
  assert.match(result.error ?? "", /Unexpected quote/);
});

testCase("rejects unclosed quoted fields", () => {
  const result = parseCsv('question,option\n"never closed,A');
  assert.match(result.error ?? "", /not closed/);
});
