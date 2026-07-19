import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/app/lib/utils";

/**
 * shadcn/ui-style button (M9-T1). Radix `Slot` supports `asChild` so links can
 * render as buttons without nesting interactive elements.
 */
/**
 * Playful chunky buttons from the Claude Design mockup: a thick navy border, a
 * gradient fill per variant, and a hard 3D drop shadow that presses on click.
 * `ghost`/`link` opt out of the frame for subtle nav actions.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-[3px] border-[#1c2b45] text-sm font-bold shadow-[0_4px_0_rgba(28,43,69,0.24)] transition-[filter,transform] hover:brightness-[1.04] active:translate-y-0.5 active:shadow-[0_2px_0_rgba(28,43,69,0.24)] disabled:pointer-events-none disabled:opacity-50 disabled:active:translate-y-0 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-b from-[#2ee0c8] to-[#1fb3a0] text-[#052a25]",
        destructive: "bg-gradient-to-b from-[#f2726d] to-[#d33f3a] text-white",
        outline: "bg-transparent text-[#1c2b45] hover:bg-black/5",
        secondary: "bg-white text-[#1c2b45]",
        ghost:
          "border-0 bg-transparent text-foreground shadow-none hover:bg-black/5 active:translate-y-0 active:shadow-none",
        link: "border-0 bg-transparent text-primary shadow-none underline-offset-4 hover:underline active:translate-y-0 active:shadow-none",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
