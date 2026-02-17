type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export function safeJsonParse(input: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export function safeJsonStringify(value: unknown, pretty = false): string {
  try {
    return JSON.stringify(value, null, pretty ? 2 : undefined);
  } catch {
    return JSON.stringify({ error: "Failed to serialize value" });
  }
}
