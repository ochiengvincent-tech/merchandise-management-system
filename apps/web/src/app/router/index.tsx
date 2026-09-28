import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../layouts/app-layout";
import { FeatureGate } from "../feature-gate";
import { DashboardPage } from "../../pages/dashboard-page";
import { ProductsPage } from "../../pages/products/products-page";
import { NewProductPage } from "../../pages/products/new-product-page";
import { PlaceholderPage } from "../../pages/placeholder-page";
import { ProductDetailPage } from "../../pages/products/product-detail-page";
import { EditProductPage } from "../../pages/products/edit-product-page";
import InventoryPage from "../../pages/inventory/inventory-page";
import LocationsPage from "../../pages/locations/locations-page";
import LocationDetailPage from "../../pages/locations/location-detail-page";
import EditLocationPage from "../../pages/locations/edit-location-page";
import NewLocationPage from "../../pages/locations/new-location-page";
import VendorsPage from "../../pages/vendors/vendors-page";
import NewVendorPage from "../../pages/vendors/new-vendor-page";
import EditVendorPage from "../../pages/vendors/edit-vendor-page";
import { SupplierProductsPage } from "../../pages/supplier-products/supplier-products-page";
import { NewSupplierProductPage } from "../../pages/supplier-products/new-supplier-product-page";
import { SupplierProductDetailPage } from "../../pages/supplier-products/supplier-product-detail-page";
import { EditSupplierProductPage } from "../../pages/supplier-products/edit-supplier-product-page";
import VendorDetailPage from "../../pages/vendors/vendor-detail-page";
import PurchaseOrdersPage from "../../pages/purchase-orders/purchase-orders-page";
import PurchaseOrderDetailPage from "../../pages/purchase-orders/purchase-order-detail-page";
import CreatePurchaseOrderPage from "../../pages/purchase-orders/create-purchase-order";
import { ApprovalsPage } from "../../pages/purchase-orders/approvals-page";

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

        <Route path="/vendors/:id" element={<VendorDetailPage />} />

        <Route path="/vendors" element={<VendorsPage />} />

        <Route
          path="/supplier-products/new"
          element={<NewSupplierProductPage />}
        />

        <Route
          path="/supplier-products/:id/edit"
          element={<EditSupplierProductPage />}
        />

        <Route
          path="/supplier-products/:id"
          element={<SupplierProductDetailPage />}
        />

        <Route path="/supplier-products" element={<SupplierProductsPage />} />

        <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />

        <Route
          path="/purchase-orders/new"
          element={<CreatePurchaseOrderPage />}
        />

        <Route
          path="/purchase-orders/:id"
          element={<PurchaseOrderDetailPage />}
        />

        <Route path="/approvals" element={<ApprovalsPage />} />

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
