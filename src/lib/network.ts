type RequestJsonOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  signal?: AbortSignal;
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function requestJson<T = any>(url: string, options: RequestJsonOptions = {}): Promise<T> {
  const {
    method = 'GET',
    headers,
    body = null,
    timeoutMs = 10000,
    retries = 1,
    backoffMs = 500,
    signal
  } = options;

  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });

      if (!response.ok) {
        const error: any = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        if (!RETRYABLE_STATUS.has(response.status) || attempt === retries) {
          throw error;
        }
        lastError = error;
      } else {
        return (await response.json()) as T;
      }
    } catch (error: any) {
      const aborted = error?.name === 'AbortError' || controller.signal.aborted;
      if (aborted && signal?.aborted) {
        throw error;
      }
      if (attempt === retries) {
        throw error;
      }
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    }

    await sleep(backoffMs * Math.pow(2, attempt));
  }

  throw lastError || new Error('requestJson failed');
}
