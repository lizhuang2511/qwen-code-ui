export function initPywebviewBridge() {}

export async function pywebviewListen<T>(
  event: string,
  callback: (event: { payload: T }) => void
): Promise<() => void> {
  const handler = (e: Event) => {
    const ce = e as CustomEvent
    callback({ payload: ce.detail as T })
  }
  window.addEventListener(event, handler as EventListener)
  return () => window.removeEventListener(event, handler as EventListener)
}
