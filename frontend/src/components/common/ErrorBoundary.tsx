import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: unknown;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-sm">
          <div className="mb-2 font-medium">An error occurred while rendering.</div>
          <div className="text-muted-foreground">Please reload the page. If the problem persists, check the console for details.</div>
        </div>
      );
    }
    return this.props.children;
  }
}

