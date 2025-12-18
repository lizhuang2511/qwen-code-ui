import React from "react";
import { cn } from "@/lib/utils";

function Code({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <code
      className={cn(
        "bg-muted relative rounded px-[0.3rem] py-[0.1rem] font-mono text-sm",
        className
      )}
    >
      {children}
    </code>
  );
}

export { Code };
