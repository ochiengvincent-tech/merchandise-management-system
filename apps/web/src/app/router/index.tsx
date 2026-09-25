import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../layouts/app-layout";
import { FeatureGate } from "../feature-gate";
import { DashboardPage } from "../../pages/dashboard-page";
import { ProductsPage } from "../../pages/products-page";
import { NewProductPage } from "../../pages/new-product-page";
import { PlaceholderPage } from "../../pages/placeholder-page";
import { ProductDetailPage } from "../../pages/product-detail-page";
import { EditProductPage } from "../../pages/edit-product-page";
import InventoryPage from "../../pages/inventory-page";
import LocationsPage from "../../pages/locations-page";
import LocationDetailPage from "../../pages/location-detail-page";
import EditLocationPage from "../../pages/edit-location-page";
import NewLocationPage from "../../pages/new-location-page";
import VendorsPage from "../../pages/vendors-page";
import NewVendorPage from "../../pages/new-vendor-page";
import EditVendorPage from "../../pages/edit-vendor-page";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/dashboard" element={<DashboardPage />} />

        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<NewProductPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="products/:id/edit" element={<EditProductPage />} />

        <Route path="/inventory" element={<InventoryPage />} />
        <Route
          path="/inventory/adjustments"
          element={<PlaceholderPage title="Adjustments" />}
        />

        <Route path="/locations/new" element={<NewLocationPage />} />
        <Route path="/locations/:id/edit" element={<EditLocationPage />} />
        <Route path="/locations/:id" element={<LocationDetailPage />} />
        <Route path="/locations" element={<LocationsPage />} />

        <Route path="/vendors/new" element={<NewVendorPage />} />
        <Route path="/vendors/:id/edit" element={<EditVendorPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
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
          path="/amendments"
          element={<PlaceholderPage title="Amendments" />}
        />

        <Route
          path="/receiving"
          element={
            <FeatureGate flag="receiving" title="Receiving">
              <PlaceholderPage title="Receiving" />
            </FeatureGate>
          }
        />

        <Route
          path="/audit"
          element={
            <FeatureGate flag="salesAudit" title="Audit">
              <PlaceholderPage title="Audit" />
            </FeatureGate>
          }
        />
      </Route>
    </Routes>
  );
}
