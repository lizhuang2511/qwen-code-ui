import * as _CSS from "csstype";

declare module "csstype" {
  interface Properties {
    WebkitAppRegion?: "drag" | "no-drag";
    appRegion?: "drag" | "no-drag";
  }
}

declare global {
  interface Window {
    pywebview?: {
      api?: Record<string, (...args: any[]) => Promise<any>>;
      state?: {
        emit(event: string, payload: unknown): void;
        on(event: string, cb: (event: { payload: unknown }) => void): () => void;
      };
    };
    pendingToolCallInput?: string;
  }
}
