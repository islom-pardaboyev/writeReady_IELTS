import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[var(--ink-blue,#1C3A5E)] text-white hover:opacity-90",
        primary: "bg-[var(--ink-blue,#1C3A5E)] text-white hover:opacity-90",
        destructive: "bg-red-500 text-white hover:bg-red-600",
        danger: "bg-[var(--coral,#ef4444)] text-white hover:opacity-90",
        outline: "border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]",
        secondary: "bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-color)] hover:opacity-80",
        ghost: "text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]",
        link: "text-blue-600 underline-offset-4 hover:underline",
        gold: "bg-[var(--gold,#c9900a)] text-white hover:opacity-90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        md: "px-5 py-2.5 text-sm",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Spinner /> : null}
        {children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

function Spinner() {
  return (
    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

export { Button, buttonVariants }
