import assert from "node:assert/strict";
import test from "node:test";
import {
  HttpRequestError,
  isSameOriginRequest,
  readJsonRequest
} from "../lib/http.ts";

const endpoint = "https://cu-quiz-platform.vercel.app/api/quiz/start";

test("same-origin check rejects missing and cross-site origins", () => {
  assert.equal(isSameOriginRequest(new Request(endpoint, { method: "POST" })), false);

  const crossOrigin = new Request(endpoint, {
    method: "POST",
    headers: {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site"
    }
  });
  assert.equal(isSameOriginRequest(crossOrigin), false);
});

test("same-origin check accepts the exact request origin", () => {
  const request = new Request(endpoint, {
    method: "POST",
    headers: {
      origin: "https://cu-quiz-platform.vercel.app",
      "sec-fetch-site": "same-origin"
    }
  });
  assert.equal(isSameOriginRequest(request), true);
});

test("JSON reader parses a bounded JSON request", async () => {
  const request = new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subjectId: "subject", questionCount: 10 })
  });

  assert.deepEqual(
    await readJsonRequest(request, 256),
    { subjectId: "subject", questionCount: 10 }
  );
});

test("JSON reader rejects non-JSON content types", async () => {
  const request = new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "not json"
  });

  await assert.rejects(
    () => readJsonRequest(request, 256),
    (error) => error instanceof HttpRequestError && error.status === 415
  );
});

test("JSON reader rejects oversized request streams", async () => {
  const request = new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(512) })
  });

  await assert.rejects(
    () => readJsonRequest(request, 64),
    (error) => error instanceof HttpRequestError && error.status === 413
  );
});

test("JSON reader rejects malformed JSON", async () => {
  const request = new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{bad json"
  });

  await assert.rejects(
    () => readJsonRequest(request, 256),
    (error) => error instanceof HttpRequestError && error.status === 400
  );
});
