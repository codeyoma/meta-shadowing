import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border-2 border-transparent bg-clip-padding text-[15px] font-bold tracking-[0.8px] uppercase whitespace-nowrap transition-[background-color,box-shadow,transform] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-3 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        google: "border-border bg-background text-foreground font-medium normal-case tracking-normal hover:bg-muted active:bg-muted",
        default: "bg-primary text-primary-foreground shadow-[0_4px_0_var(--primary-pressed)] hover:bg-primary/90 active:translate-y-[3px] active:shadow-[0_1px_0_var(--primary-pressed)]",
        inverse: "bg-primary-foreground text-primary shadow-[0_4px_0_var(--border)] hover:bg-primary-foreground/90 active:translate-y-[3px] active:shadow-[0_1px_0_var(--border)]",
        practice: "bg-practice-action text-practice-action-foreground shadow-[0_4px_0_var(--practice-action-pressed)] hover:bg-practice-action/90 active:translate-y-[3px] active:shadow-[0_1px_0_var(--practice-action-pressed)]",
        "stage-exit": "text-close-action normal-case tracking-normal hover:bg-close-action/10 active:bg-close-action/15",
        close: "bg-close-action text-primary-foreground shadow-[0_4px_0_var(--close-action-pressed)] hover:bg-close-action/90 active:translate-y-[3px] active:shadow-[0_1px_0_var(--close-action-pressed)]",
        navigation: "min-w-0 flex-col text-display normal-case tracking-normal hover:bg-[var(--nav-surface)] aria-[current=location]:bg-[var(--nav-surface)] focus-visible:ring-inset focus-visible:ring-offset-0 [&_svg]:text-[var(--nav-ink)]",
        outline:
          "border-border bg-background text-secondary-foreground shadow-[0_3px_0_var(--border)] hover:bg-accent aria-expanded:bg-accent active:translate-y-[2px] active:shadow-[0_1px_0_var(--border)]",
        secondary:
          "bg-accent text-accent-foreground hover:bg-accent/80",
        analysis: "bg-audio text-audio-foreground hover:bg-audio/90 normal-case tracking-normal",
        ghost:
          "text-foreground hover:bg-accent aria-expanded:bg-accent normal-case tracking-normal",
        "ghost-inverse":
          "text-primary-foreground hover:bg-primary-foreground/20 normal-case tracking-normal",
        destructive:
          "border-destructive bg-background text-destructive-foreground hover:bg-destructive/10",
        link: "text-display normal-case tracking-normal underline-offset-4 hover:underline",
        choice: "justify-start whitespace-normal text-left normal-case tracking-normal border-border bg-background text-foreground hover:bg-accent data-[selected=true]:border-primary data-[selected=true]:bg-accent aria-current:border-primary aria-current:bg-accent aria-pressed:border-primary aria-pressed:bg-accent",
        sentence: "justify-start rounded-none border-0 whitespace-normal text-left normal-case tracking-normal bg-background text-foreground hover:bg-accent data-[selected=true]:bg-accent aria-current:bg-accent focus-visible:ring-inset focus-visible:ring-offset-0",
        context: "min-w-0 whitespace-normal normal-case tracking-normal text-muted-foreground shadow-[0_3px_5px_-1px_var(--border)] hover:bg-accent aria-expanded:bg-accent data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground active:translate-y-px active:shadow-[0_1px_2px_var(--border)]",
        book: "min-w-0 whitespace-normal normal-case tracking-normal text-muted-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
        audio: "border-audio bg-background text-audio-foreground hover:bg-accent aria-pressed:bg-accent",
      },
      size: {
        navigation: "min-h-[var(--nav-tab-height,4rem)] gap-1 px-1 py-[var(--nav-tab-padding,0.5rem)] text-xs [&_svg]:size-[var(--nav-icon-size,1.5rem)]",
        default:
          "min-h-[50px] gap-2 px-4 py-3",
        xs: "min-h-11 gap-1 px-2 py-2 text-xs",
        sm: "min-h-11 gap-2 px-3 py-2 text-sm",
        lg: "min-h-14 gap-3 px-5 py-3 text-base",
        row: "h-auto min-h-14 gap-4 p-4",
        icon: "size-11 p-0",
        "icon-xs": "size-11 p-0 [&_svg]:size-4",
        "icon-sm": "size-11 p-0 [&_svg]:size-4",
        "icon-lg": "size-14 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
