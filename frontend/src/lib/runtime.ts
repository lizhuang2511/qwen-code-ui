export function isPywebview(): boolean {
  return typeof (window as any).pywebview !== "undefined";
}

export async function getPlatform(): Promise<string> {
  if (isPywebview()) {
    const api = (window as any).pywebview?.api;
    if (api && typeof api.platform === "function") {
      const p = await api.platform();
      return typeof p === "string" ? p : "web";
    }
    return "web";
  }
  const raw =
    (navigator as any).userAgentData?.platform ||
    navigator.platform ||
    "web";
  const s = String(raw).toLowerCase();
  if (s.includes("win")) return "windows";
  if (s.includes("mac")) return "macos";
  if (s.includes("linux")) return "linux";
  return "web";
}
