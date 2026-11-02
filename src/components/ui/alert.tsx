import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Adapted from the obersai-docs alert; colours come from the Aedoxy tokens (warn works in light and dark).
const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] gap-y-0.5 rounded-xl border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5",
  {
    variants: {
      variant: {
        default: "border-line bg-surface-2 text-fg [&>svg]:text-fg-muted",
        warning: "border-warn/40 bg-warn/10 text-fg [&>svg]:text-warn",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div role="note" data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("col-start-2 font-medium leading-snug text-heading", className)} {...props} />
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("col-start-2 text-sm leading-relaxed text-fg-muted", className)} {...props} />
}

export { Alert, AlertDescription, AlertTitle }
