"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

function Progress({
  className,
  value,
  max = 100,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { variant?: "default" | "lesson" }) {
  const total = max > 0 ? max : 100;
  const percent = Math.min(100, Math.max(0, ((value ?? 0) / total) * 100));
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      data-variant={variant}
      value={value}
      max={total}
      className={cn(
        "relative flex h-3 w-full items-center overflow-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("size-full flex-1 rounded-full transition-transform duration-300 ease-out", variant === "lesson" ? "bg-reward" : "bg-primary")}
        style={{ transform: `translateX(-${100 - percent}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
