/**
 * Minimal Server-Sent Events client over fetch so we can send the Authorization
 * header (EventSource cannot). Reconnects with backoff until stopped.
 */
export function subscribeSse(
  url: string,
  options: {
    getHeaders: () => Promise<Record<string, string>>;
    onEvent: (event: string, data: string) => void;
    onStatus?: (status: "connecting" | "open" | "retrying" | "closed") => void;
  }
): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let attempt = 0;

  const run = async () => {
    while (!stopped) {
      controller = new AbortController();
      options.onStatus?.(attempt === 0 ? "connecting" : "retrying");
      try {
        const res = await fetch(url, {
          headers: { Accept: "text/event-stream", ...(await options.getHeaders()) },
          signal: controller.signal,
          cache: "no-store",
        });
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          options.onStatus?.("closed");
          return; // not retryable
        }
        if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);
        attempt = 0;
        options.onStatus?.("open");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            let event = "message";
            const data: string[] = [];
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
            }
            if (data.length) options.onEvent(event, data.join("\n"));
            if (event === "gone") stopped = true;
          }
        }
      } catch {
        if (stopped) break;
      }
      if (stopped) break;
      attempt++;
      // Backoff: 1s, 2s, 4s ... capped at 15s (the server also recycles streams every 10 min)
      await new Promise((r) => setTimeout(r, Math.min(15000, 1000 * 2 ** Math.min(attempt, 4))));
    }
    options.onStatus?.("closed");
  };

  void run();
  return () => {
    stopped = true;
    controller?.abort();
  };
}
