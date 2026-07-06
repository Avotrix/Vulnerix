import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:shadow-lg",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Custom variants for Vulnerix
        accent: "bg-accent text-accent-foreground hover:bg-cyan-light shadow-md hover:shadow-glow",
        hero: "bg-accent text-accent-foreground hover:bg-cyan-light shadow-lg hover:shadow-glow font-semibold",
        "hero-outline": "border-2 border-accent text-accent bg-transparent hover:bg-accent hover:text-accent-foreground",
        navy: "bg-navy text-primary-foreground hover:bg-navy-light shadow-md",
        "navy-outline": "border-2 border-navy text-navy bg-transparent hover:bg-navy hover:text-primary-foreground",
        severity: {
          critical: "bg-severity-critical text-primary-foreground hover:bg-severity-critical/90",
          high: "bg-severity-high text-primary-foreground hover:bg-severity-high/90",
          medium: "bg-severity-medium text-foreground hover:bg-severity-medium/90",
          low: "bg-severity-low text-primary-foreground hover:bg-severity-low/90",
        },
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-lg px-8 text-base",
        xl: "h-14 rounded-xl px-10 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
