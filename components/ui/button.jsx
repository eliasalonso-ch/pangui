import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 font-[inherit]",
  {
    variants: {
      variant: {
        default:     "bg-primary text-primary-foreground shadow hover:bg-primary/90 active:scale-[0.98]",
        destructive: "bg-destructive text-destructive-foreground shadow hover:bg-destructive/90 active:scale-[0.98]",
        outline:     "border border-input bg-background shadow-sm hover:bg-secondary hover:text-secondary-foreground",
        secondary:   "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost:       "hover:bg-secondary hover:text-secondary-foreground",
        success:     "bg-green-500 text-white shadow hover:bg-green-600 active:scale-[0.98]",
        link:        "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm:      "h-8 rounded-md px-3 text-xs",
        lg:      "h-11 rounded-lg px-6 text-base",
        icon:    "size-9",
        full:    "h-12 w-full px-6 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
