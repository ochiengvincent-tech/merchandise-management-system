import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

type TableContainerProps = HTMLAttributes<HTMLDivElement>;
type TableProps = TableHTMLAttributes<HTMLTableElement>;
type TableHeadProps = HTMLAttributes<HTMLTableSectionElement>;
type TableBodyProps = HTMLAttributes<HTMLTableSectionElement>;
type TableRowProps = HTMLAttributes<HTMLTableRowElement>;
type TableHeaderProps = ThHTMLAttributes<HTMLTableCellElement>;
type TableCellProps = TdHTMLAttributes<HTMLTableCellElement>;

export function TableContainer({
  className = "",
  ...props
}: TableContainerProps) {
  return (
    <div
      {...props}
      className={`overflow-x-auto rounded-lg border border-slate-200 bg-white ${className}`}
    />
  );
}

export function Table({ className = "", ...props }: TableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={`w-full border-collapse text-sm ${className}`}
        {...props}
      />
    </div>
  );
}

export function TableHead({ className = "", ...props }: TableHeadProps) {
  return (
    <thead
      {...props}
      className={`border-b border-slate-200 bg-slate-50 ${className}`}
    />
  );
}

export function TableBody({ className = "", ...props }: TableBodyProps) {
  return (
    <tbody {...props} className={`divide-y divide-slate-100 ${className}`} />
  );
}

export function TableRow({ className = "", ...props }: TableRowProps) {
  return (
    <tr
      {...props}
      className={`transition-colors hover:bg-slate-50 ${className}`}
    />
  );
}

export function TableHeader({ className = "", ...props }: TableHeaderProps) {
  return (
    <th
      {...props}
      className={`h-11 px-4 text-left text-xs font-medium uppercase tracking-wide text-slate-500 ${className}`}
    />
  );
}

export function TableCell({ className = "", ...props }: TableCellProps) {
  return (
    <td
      {...props}
      className={`h-12 px-4 text-sm text-slate-700 ${className}`}
    />
  );
}
