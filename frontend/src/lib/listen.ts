import { webListen } from "./webApi";
import { pywebviewListen } from "./pywebviewBridge";
import { isPywebview } from "./runtime";

export async function listen<T>(
  event: string,
  handler: (event: { event: string; payload: T }) => void
): Promise<() => void> {
  // Use a wrapper to match the expected handler signature
  const callback = (e: { payload: T }) => handler({ event, payload: e.payload });

  if (isPywebview()) {
    return pywebviewListen<T>(event, callback);
  }
  
  // Use WebSocket fallback for web mode
  return webListen<T>(event, callback);
}
