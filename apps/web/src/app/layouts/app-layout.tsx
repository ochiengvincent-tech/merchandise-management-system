import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./sidebar";

const routeLabels: Array<[RegExp, string]> = [
  [/^\/dashboard$/, "Dashboard"],
  [/^\/products(?:\/new|\/[^/]+(?:\/edit)?)?$/, "Products"],
  [/^\/inventory\/valuation$/, "Valuation"],
  [/^\/inventory\/adjustments$/, "Adjustments"],
  [/^\/inventory$/, "Inventory"],
  [/^\/locations(?:\/new|\/[^/]+(?:\/edit)?)?$/, "Locations"],
  [/^\/vendors(?:\/new|\/[^/]+(?:\/edit)?)?$/, "Vendors"],
  [/^\/supplier-products(?:\/new|\/[^/]+(?:\/edit)?)?$/, "Supplier Products"],
  [/^\/purchase-orders\/new$/, "New Purchase Order"],
  [/^\/purchase-orders\/[^/]+$/, "Purchase Order Details"],
  [/^\/purchase-orders$/, "Purchase Orders"],
  [/^\/approvals$/, "Approvals"],
  [/^\/reorder-suggestions$/, "Reorder Suggestions"],
  [/^\/amendments$/, "Amendments"],
  [/^\/audit$/, "Audit"],
];

function useThemePreference() {
  const [preference, setPreference] = useState(() => {
    if (typeof window === "undefined") return "system";
    return window.localStorage.getItem("mms-theme") ?? "system";
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = preference === "dark" || (preference === "system" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  const toggle = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    window.localStorage.setItem("mms-theme", next);
    setPreference(next);
  };

  return { dark: preference === "dark" || (preference === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches), toggle };
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const theme = useThemePreference();
  const pageLabel = routeLabels.find(([pattern]) => pattern.test(location.pathname))?.[1] ?? "Workspace";
  const group = ["Products", "Inventory", "Locations", "Adjustments", "Valuation"].includes(pageLabel)
    ? "Merchandising"
    : ["Vendors", "Supplier Products"].includes(pageLabel)
      ? "Suppliers"
      : ["Purchase Orders", "Purchase Order Details", "New Purchase Order", "Approvals", "Reorder Suggestions", "Amendments"].includes(pageLabel)
        ? "Procurement"
        : pageLabel === "Audit" ? "System" : "Overview";

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-950">
      <Sidebar />

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full">
            <Sidebar mobile onNavigate={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:ml-[252px]">
        <header className="app-topbar sticky top-0 z-20 flex h-[70px] shrink-0 items-center justify-between border-b border-slate-200 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="truncate text-sm font-semibold text-slate-500">
              <Link to="/dashboard" className="hover:text-slate-900">{group}</Link>
              <span className="mx-2 text-slate-300">/</span>
              <span className="text-slate-800">{pageLabel}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label={`Switch to ${theme.dark ? "light" : "dark"} appearance`}
              title={`Switch to ${theme.dark ? "light" : "dark"} appearance`}
              className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
              onClick={theme.toggle}
            >
              {theme.dark ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <circle cx="12" cy="12" r="4" /><path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.4 15.5A8.5 8.5 0 0 1 8.5 3.6 8.5 8.5 0 1 0 20.4 15.5Z" />
                </svg>
              )}
            </button>
            <div className="hidden border-l border-slate-200 pl-3 sm:block">
              <p className="text-sm font-semibold text-slate-800">Vincent</p>
              <p className="text-xs text-slate-500">Workspace</p>
            </div>
          </div>
        </header>

        <main className="app-main-content min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
