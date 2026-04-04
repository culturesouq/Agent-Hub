import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full bg-surface-container-highest px-3 py-1 text-base text-foreground placeholder:text-muted-foreground transition-all file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:outline-none focus-visible:bg-gradient-to-b focus-visible:from-surface-container-highest focus-visible:to-primary-container/20 focus-visible:shadow-[0_0_0_1px_rgba(224,182,255,0.25)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
