type ButtonProps = {
  children: React.ReactNode;
  type?: "button" | "submit" | "reset";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  onClick?: () => void;
};

const variants = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400",
  ghost:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:text-slate-400",
  danger:
    "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
};

export function Button({
  children,
  type = "button",
  variant = "primary",
  disabled = false,
  onClick,
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed ${variants[variant]}`}
    >
      {children}
    </button>
  );
}