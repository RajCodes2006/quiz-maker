export class HttpRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

/** Restrict cookie-authenticated API writes to the exact origin serving the request. */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const requestOrigin = new URL(request.url).origin;
    const suppliedOrigin = new URL(origin).origin;
    const fetchSite = request.headers.get("sec-fetch-site");

    return suppliedOrigin === requestOrigin && fetchSite !== "cross-site";
  } catch {
    return false;
  }
}

/** Read JSON incrementally so a missing/forged Content-Length cannot bypass the cap. */
export async function readJsonRequest<T>(
  request: Request,
  maxBytes: number
): Promise<T> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    throw new HttpRequestError("Send a JSON request.", 415);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpRequestError("Request body is too large.", 413);
  }

  if (!request.body) {
    throw new HttpRequestError("Request body is required.", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new HttpRequestError("Request body is too large.", 413);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(decoded) as T;
  } catch {
    throw new HttpRequestError("Invalid JSON request body.", 400);
  }
}
