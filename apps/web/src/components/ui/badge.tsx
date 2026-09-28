export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "sent" | "partial";

type BadgeProps = {
  children: React.ReactNode;
  variant?: BadgeVariant;
};

const variants = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-green-50 text-green-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
  sent: "bg-teal-100 text-teal-950 ring-1 ring-inset ring-teal-300",
  partial: "bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-300",
};

export function Badge({
  children,
  variant = "default",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variants[variant]}`}
    >
      {children}
    </span>
  );
}