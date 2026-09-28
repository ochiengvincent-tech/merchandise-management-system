import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "../../components/ui/icon";
import { featureFlags, type FeatureFlagKey } from "../../lib/feature-flags";

type NavItem = { label: string; path: string; icon: IconName; flag?: FeatureFlagKey };

const navigation: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", icon: "dashboard", path: "/dashboard" }],
  },
  {
    label: "Merchandising",
    items: [
      { label: "Products", icon: "box", path: "/products", flag: "inventory" },
      { label: "Inventory", icon: "warehouse", path: "/inventory", flag: "inventory" },
      { label: "Locations", icon: "location", path: "/locations", flag: "inventory" },
      {
        label: "Adjustments",
        icon: "adjustment",
        path: "/inventory/adjustments",
        flag: "inventory",
      },
      { label: "Valuation", icon: "valuation", path: "/inventory/valuation", flag: "inventory" },
    ],
  },
  {
    label: "Suppliers",
    items: [
      { label: "Vendors", icon: "vendor", path: "/vendors", flag: "vendorManagement" },
      {
        label: "Supplier Products",
        icon: "link",
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
        icon: "purchase-order",
        path: "/purchase-orders",
        flag: "procurement",
      },
      { label: "Approvals", icon: "approval", path: "/approvals", flag: "procurement" },
      { label: "Reorder suggestions", icon: "reorder", path: "/reorder-suggestions", flag: "procurement" },
      { label: "Amendments", icon: "amendment", path: "/amendments", flag: "procurement" },
    ],
  },
  {
    label: "System",
    items: [{ label: "Audit", icon: "audit", path: "/audit" }],
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
          ? "app-sidebar flex h-full w-72 flex-col border-r border-slate-700/70"
          : "app-sidebar hidden w-[252px] shrink-0 border-r border-slate-700/70 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:flex-col"
      }
    >
      <div className="flex h-[78px] shrink-0 items-center justify-between border-b border-slate-700/70 px-5">
        <div className="flex items-center gap-2.5">
          <span className="app-brand-mark grid h-8 w-8 place-items-center rounded-lg shadow-inner">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8c3-3 5 3 9 0s6 3 9 0M3 14c3-3 5 3 9 0s6 3 9 0M3 20c3-3 5 3 9 0s6 3 9 0" /></svg>
          </span>
          <div>
            <p className="text-sm font-bold tracking-tight text-white">Harbor MMS</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Merchandising operations</p>
          </div>
        </div>

        {mobile && (
          <button
            type="button"
            aria-label="Close navigation"
            className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
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

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="mb-2 px-2 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
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
                        "app-nav-link block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive ? "font-semibold" : "",
                      ].join(" ")
                    }
                  >
                    <Icon name={item.icon} className="mr-2.5 inline-block h-[17px] w-[17px] align-[-3px] opacity-85" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="shrink-0 border-t border-slate-700/70 p-4">
        <p className="text-sm font-medium text-slate-200">Vincent</p>
        <p className="mt-0.5 text-xs text-slate-400">Software Engineer</p>
      </div>
    </aside>
  );
}
