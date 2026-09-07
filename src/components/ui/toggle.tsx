"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Toggle as TogglePrimitive } from "radix-ui"

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-2 rounded-lg text-[15px] font-bold whitespace-nowrap transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border-2 border-border bg-background data-[state=on]:border-primary",
        choice: "justify-start whitespace-normal border-2 border-border bg-background text-left data-[state=on]:border-primary",
        path: "justify-start whitespace-normal bg-transparent text-left hover:bg-transparent data-[state=on]:bg-transparent data-[state=on]:text-foreground",
      },
      size: {
        default:
          "min-h-12 min-w-11 px-4 py-2",
        sm: "min-h-11 min-w-11 px-3 py-2 text-sm",
        lg: "min-h-14 min-w-14 px-4 py-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
