import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-sm border-2 border-input bg-background px-4 py-2 text-base transition-colors outline-none file:mr-3 file:inline-flex file:h-8 file:rounded-sm file:border-0 file:bg-accent file:px-3 file:text-sm file:font-bold file:text-accent-foreground placeholder:text-muted-foreground focus-visible:border-audio focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
