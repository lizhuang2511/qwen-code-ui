import { webListen } from "./webApi";

export async function listen<T>(
  event: string,
  handler: (event: { event: string; payload: T }) => void
): Promise<() => void> {
  // Pass to webListen correctly
  return webListen<T>(event, (e) => handler({ event, payload: e.payload }));
}
