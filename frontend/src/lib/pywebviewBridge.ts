// This file is kept for backwards compatibility but is no longer used for listening
// since all events are now routed through WebSocket for consistency between Desktop and Web.
export function initPywebviewBridge() {}

export function pywebviewListen<T>(
  event: string,
  callback: (event: { payload: T }) => void
): () => void {
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<T>;
    // We expect the payload directly in the detail property
    callback({ payload: customEvent.detail });
  };

  window.addEventListener(event, handler);

  return () => {
    window.removeEventListener(event, handler);
  };
}
