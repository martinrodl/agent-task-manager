/** Parse JSON safely — returns fallback on empty body, non-JSON, or non-ok status. */
export async function fetchJSON<T>(url: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const res = await fetch(url, init)
    const text = await res.text()
    if (!text) return fallback
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}
