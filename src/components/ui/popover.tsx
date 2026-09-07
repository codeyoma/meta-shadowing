"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Popover as PopoverPrimitive } from "radix-ui"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  variant = "default",
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  variant?: "default" | "soft" | "soft-inverse" | "primary"
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        data-variant={variant}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "group/popover z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 rounded-lg border-2 border-border p-5 text-base outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          {
            default: "bg-popover text-popover-foreground",
            soft: "bg-accent text-accent-foreground",
            "soft-inverse": "bg-accent text-primary-foreground",
            primary: "border-primary bg-primary text-primary-foreground",
          }[variant],
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverArrow(props: React.ComponentProps<typeof PopoverPrimitive.Arrow>) {
  return <PopoverPrimitive.Arrow data-slot="popover-arrow" className="fill-popover group-data-[variant=soft]/popover:fill-accent group-data-[variant=soft-inverse]/popover:fill-accent group-data-[variant=primary]/popover:fill-primary" width={24} height={12} {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-heading text-lg font-bold text-display group-data-[variant=soft-inverse]/popover:text-inherit group-data-[variant=primary]/popover:text-inherit", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<"p"> & { tone?: "default" | "metadata" }) {
  return (
    <p
      data-slot="popover-description"
      className={cn(tone === "metadata" ? "text-display/80" : "text-muted-foreground group-data-[variant=soft]/popover:text-inherit group-data-[variant=soft-inverse]/popover:text-inherit group-data-[variant=primary]/popover:text-inherit", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverAnchor,
  PopoverArrow,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
