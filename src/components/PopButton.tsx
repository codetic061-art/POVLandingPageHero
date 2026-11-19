import React from "react";
import { cn } from "@/lib/utils";

export interface PopButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export function PopButton({
  className,
  children = "Let's Get Started!",
  type = "button",
  ...props
}: PopButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "group relative inline-flex cursor-pointer items-center justify-center font-semibold uppercase tracking-[0.04em] text-[#F4F2ED]",
        "rounded-xl border-2 border-[#292B2E] bg-[#4257F5]",
        "px-[clamp(1.25rem,1.95vw,2rem)] py-[clamp(0.55rem,0.86vw,0.9rem)] text-[clamp(0.72rem,0.9vw,0.92rem)] whitespace-nowrap",
        "transition-all duration-150 ease-[cubic-bezier(0,0,0.58,1)]",
        "shadow-[0_9px_0_-2px_#2B3ED9,0_9px_0_0_#292B2E,0_16px_0_0_#D6DBF6]",
        "hover:translate-y-1 hover:bg-[#384CE8] hover:shadow-[0_5px_0_-2px_#2B3ED9,0_5px_0_0_#292B2E,0_11px_0_0_#D6DBF6]",
        "active:translate-y-[9px] active:bg-[#2F42D6] active:shadow-[0_0px_0_-2px_#2B3ED9,0_0px_0_0_#292B2E,0_0px_0_0_#D6DBF6]",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#292B2E]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export default PopButton;
