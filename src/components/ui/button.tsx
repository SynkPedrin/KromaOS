import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[background,color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-purple text-white shadow-[0_6px_20px_rgba(118,37,245,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-purple-600",
        dark: "bg-kblack text-white hover:bg-black shadow-[0_6px_20px_rgba(17,16,21,0.18)]",
        lime: "bg-lime text-lime-ink hover:brightness-95 shadow-[0_6px_20px_rgba(198,255,0,0.35)]",
        secondary: "bg-white/80 text-ink border border-hairline hover:bg-white shadow-sm",
        ghost: "text-ink-2 hover:bg-black/[0.04] hover:text-ink",
        danger: "bg-danger text-white hover:brightness-95",
        link: "text-purple underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-8 px-3 text-[13px] rounded-lg",
        md: "h-10 px-4",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9 rounded-lg",
        "icon-sm": "size-7 rounded-md [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, size, asChild, loading, children, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { buttonVariants };
