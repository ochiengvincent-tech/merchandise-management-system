import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../layouts/app-layout";
import { DashboardPage } from "../../pages/dashboard-page";
import { PlaceholderPage } from "../../pages/placeholder-page";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/dashboard" element={<DashboardPage />} />

        <Route
          path="/products"
          element={<PlaceholderPage title="Products" />}
        />

        <Route
          path="/inventory"
          element={<PlaceholderPage title="Inventory" />}
        />

        <Route
          path="/locations"
          element={<PlaceholderPage title="Locations" />}
        />

        <Route
          path="/inventory/adjustments"
          element={<PlaceholderPage title="Adjustments" />}
        />

        <Route
          path="/vendors"
          element={<PlaceholderPage title="Vendors" />}
        />

        <Route
          path="/supplier-products"
          element={<PlaceholderPage title="Supplier Products" />}
        />

        <Route
          path="/purchase-orders"
          element={<PlaceholderPage title="Purchase Orders" />}
        />

        <Route
          path="/approvals"
          element={<PlaceholderPage title="Approvals" />}
        />

        <Route
          path="/receiving"
          element={<PlaceholderPage title="Receiving" />}
        />

        <Route
          path="/amendments"
          element={<PlaceholderPage title="Amendments" />}
        />

        <Route path="/audit" element={<PlaceholderPage title="Audit" />} />
      </Route>
    </Routes>
  );
}