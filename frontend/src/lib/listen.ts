import { webListen } from "./webApi";
import { pywebviewListen } from "./pywebviewBridge";
import { isPywebview } from "./runtime";

export async function listen<T>(
  event: string,
  callback: (event: { payload: T }) => void
): Promise<() => void> {
  if (isPywebview()) {
    return pywebviewListen<T>(event, callback);
  }
  return webListen<T>(event, callback);
}
