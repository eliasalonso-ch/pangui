"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

const SheetOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
SheetOverlay.displayName = "SheetOverlay"

const SheetContent = React.forwardRef(({ className, children, side = "bottom", ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 bg-background shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out",
        side === "bottom" && "inset-x-0 bottom-0 rounded-t-2xl data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        side === "top"    && "inset-x-0 top-0 rounded-b-2xl data-[state=closed]:slide-out-to-top    data-[state=open]:slide-in-from-top",
        side === "left"   && "inset-y-0 left-0 h-full w-80 data-[state=closed]:slide-out-to-left    data-[state=open]:slide-in-from-left",
        side === "right"  && "inset-y-0 right-0 h-full w-80 data-[state=closed]:slide-out-to-right   data-[state=open]:slide-in-from-right",
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = "SheetContent"

const SheetHeader = ({ className, ...props }) => (
  <div className={cn("flex items-center justify-between px-5 pt-5 pb-3", className)} {...props} />
)

const SheetTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-base font-bold text-foreground", className)} {...props} />
))
SheetTitle.displayName = "SheetTitle"

const SheetDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
))
SheetDescription.displayName = "SheetDescription"

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription }
