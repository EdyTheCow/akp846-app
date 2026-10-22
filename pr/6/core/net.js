export class HttpError extends Error {
  constructor(status, body) {
    super(body?.message ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal, cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new HttpError(res.status, body);
    return body;
  } finally {
    clearTimeout(timer);
  }
}
