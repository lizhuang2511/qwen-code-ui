import React from "react";
import { SmartLogo } from "../branding/SmartLogo";
import { DesktopText } from "../branding/DesktopText";

type PageLayoutProps = {
  children: React.ReactNode;
};

/**
 * PageLayout
 * Shared layout for top header + a single scrollable content region.
 * Assumes the parent provides a flex h-screen w-full overflow-hidden wrapper.
 */
export function PageLayout({ children }: PageLayoutProps) {
  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Top Header */}
      <div className="border-b border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex items-center w-full">
            {/* Left section - Smart Desktop Logo */}
            <div className="flex flex-1 items-center gap-1">
              <SmartLogo />
              <DesktopText size="small" />
            </div>

            {/* Right section - Empty to maintain layout balance if needed, or just remove */}
             <div className="flex flex-1"></div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 flex flex-col bg-background min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
