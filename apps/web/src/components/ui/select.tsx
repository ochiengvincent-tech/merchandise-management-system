import type { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className = "", ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={`h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${className}`}
    />
  );
}