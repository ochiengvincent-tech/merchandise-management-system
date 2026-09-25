import { NavLink } from "react-router-dom";
import { featureFlags, type FeatureFlagKey } from "../../lib/feature-flags";

type NavItem = { label: string; path: string; flag?: FeatureFlagKey };

const navigation: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", path: "/dashboard" }],
  },
  {
    label: "Merchandising",
    items: [
      { label: "Products", path: "/products", flag: "inventory" },
      { label: "Inventory", path: "/inventory", flag: "inventory" },
      { label: "Locations", path: "/locations", flag: "inventory" },
      {
        label: "Adjustments",
        path: "/inventory/adjustments",
        flag: "inventory",
      },
    ],
  },
  {
    label: "Suppliers",
    items: [
      { label: "Vendors", path: "/vendors", flag: "vendorManagement" },
      {
        label: "Supplier Products",
        path: "/supplier-products",
        flag: "vendorManagement",
      },
    ],
  },
  {
    label: "Procurement",
    items: [
      {
        label: "Purchase Orders",
        path: "/purchase-orders",
        flag: "procurement",
      },
      { label: "Approvals", path: "/approvals", flag: "procurement" },
      { label: "Amendments", path: "/amendments", flag: "procurement" },
      { label: "Receiving", path: "/receiving", flag: "receiving" },
    ],
  },
  {
    label: "System",
    items: [{ label: "Audit", path: "/audit", flag: "salesAudit" }],
  },
];

type SidebarProps = {
  mobile?: boolean;
  onNavigate?: () => void;
  onClose?: () => void;
};

export function Sidebar({ mobile = false, onNavigate, onClose }: SidebarProps) {
  const sections = navigation
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.flag || featureFlags[item.flag],
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={
        mobile
          ? "flex h-full w-72 flex-col bg-white"
          : "hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col"
      }
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
        <div>
          <p className="text-sm font-semibold tracking-tight text-slate-950">
            MMS
          </p>
          <p className="text-xs text-slate-500">Merchandising System</p>
        </div>

        {mobile && (
          <button
            type="button"
            aria-label="Close navigation"
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
            onClick={onClose}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 6l12 12M18 6L6 18"
              />
            </svg>
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {section.label}
              </p>

              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      [
                        "block rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-slate-100 font-medium text-slate-950"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                      ].join(" ")
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="shrink-0 border-t border-slate-200 p-4">
        <p className="text-sm font-medium text-slate-800">Vincent</p>
        <p className="mt-0.5 text-xs text-slate-500">Software Engineer</p>
      </div>
    </aside>
  );
}
