import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../layouts/app-layout";
import { FeatureGate } from "../feature-gate";
import { DashboardPage } from "../../pages/dashboard-page";
import { ProductsPage } from "../../pages/products/products-page";
import { NewProductPage } from "../../pages/products/new-product-page";
import { AuditPage } from "../../pages/audit-page";
import { ProductDetailPage } from "../../pages/products/product-detail-page";
import { EditProductPage } from "../../pages/products/edit-product-page";
import InventoryPage from "../../pages/inventory/inventory-page";
import { AdjustmentsPage } from "../../pages/inventory/adjustments-page";
import { InventoryValuationPage } from "../../pages/inventory/valuation-page";
import { ReorderSuggestionsPage } from "../../pages/purchase-orders/reorder-suggestions-page";
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
import { AmendmentsPage } from "../../pages/purchase-orders/amendments-page";
import { ReceivingPage } from "../../pages/receiving/receiving-page";
import { ReceiptDetailPage } from "../../pages/receiving/receipt-detail-page";
import { WarehouseOperationsPage } from "../../pages/warehouse-operations/warehouse-operations-page";
import { RetailSalesPage } from "../../pages/retail-sales/retail-sales-page";
import { SalesAuditPage } from "../../pages/sales-audit/sales-audit-page";
import { FinancialsPage } from "../../pages/financials/financials-page";
import type { FeatureFlagKey } from "../../lib/feature-flags";

function gatedPage(flag: FeatureFlagKey, title: string, page: React.ReactNode) {
  return <FeatureGate flag={flag} title={title}>{page}</FeatureGate>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/dashboard" element={<DashboardPage />} />

        <Route path="/products" element={gatedPage("inventory", "Inventory", <ProductsPage />)} />
        <Route path="/products/new" element={gatedPage("inventory", "Inventory", <NewProductPage />)} />
        <Route path="/products/:id" element={gatedPage("inventory", "Inventory", <ProductDetailPage />)} />
        <Route path="products/:id/edit" element={gatedPage("inventory", "Inventory", <EditProductPage />)} />

        <Route path="/inventory" element={gatedPage("inventory", "Inventory", <InventoryPage />)} />
        <Route path="/inventory/adjustments" element={gatedPage("inventory", "Inventory", <AdjustmentsPage />)} />
        <Route path="/inventory/valuation" element={gatedPage("inventory", "Inventory", <InventoryValuationPage />)} />

        <Route path="/receiving" element={gatedPage("receiving", "Receiving", <ReceivingPage />)} />
        <Route path="/receiving/receipts/:id" element={gatedPage("receiving", "Receiving", <ReceiptDetailPage />)} />

        <Route path="/locations/new" element={gatedPage("inventory", "Inventory", <NewLocationPage />)} />
        <Route path="/locations/:id/edit" element={gatedPage("inventory", "Inventory", <EditLocationPage />)} />
        <Route path="/locations/:id" element={gatedPage("inventory", "Inventory", <LocationDetailPage />)} />
        <Route path="/locations" element={gatedPage("inventory", "Inventory", <LocationsPage />)} />

        <Route path="/vendors/new" element={gatedPage("vendorManagement", "Vendor Management", <NewVendorPage />)} />

        <Route path="/vendors/:id/edit" element={gatedPage("vendorManagement", "Vendor Management", <EditVendorPage />)} />

        <Route path="/vendors/:id" element={gatedPage("vendorManagement", "Vendor Management", <VendorDetailPage />)} />

        <Route path="/vendors" element={gatedPage("vendorManagement", "Vendor Management", <VendorsPage />)} />

        <Route
          path="/supplier-products/new"
          element={gatedPage("vendorManagement", "Vendor Management", <NewSupplierProductPage />)}
        />

        <Route
          path="/supplier-products/:id/edit"
          element={gatedPage("vendorManagement", "Vendor Management", <EditSupplierProductPage />)}
        />

        <Route
          path="/supplier-products/:id"
          element={gatedPage("vendorManagement", "Vendor Management", <SupplierProductDetailPage />)}
        />

        <Route path="/supplier-products" element={gatedPage("vendorManagement", "Vendor Management", <SupplierProductsPage />)} />

        <Route path="/purchase-orders" element={gatedPage("procurement", "Procurement", <PurchaseOrdersPage />)} />
        <Route path="/reorder-suggestions" element={gatedPage("procurement", "Procurement", <ReorderSuggestionsPage />)} />

        <Route
          path="/purchase-orders/new"
          element={gatedPage("procurement", "Procurement", <CreatePurchaseOrderPage />)}
        />

        <Route
          path="/purchase-orders/:id"
          element={gatedPage("procurement", "Procurement", <PurchaseOrderDetailPage />)}
        />

        <Route path="/approvals" element={gatedPage("procurement", "Procurement", <ApprovalsPage />)} />

        <Route path="/amendments" element={gatedPage("procurement", "Procurement", <AmendmentsPage />)} />

        <Route path="/audit" element={<AuditPage />} />
        <Route path="/warehouse-operations" element={gatedPage("warehouseOperations", "Warehouse Operations", <WarehouseOperationsPage />)} />
        <Route path="/retail-sales" element={gatedPage("retailSales", "Retail Sales", <RetailSalesPage />)} />
        <Route path="/sales-audit" element={gatedPage("salesAudit", "Sales Audit", <SalesAuditPage />)} />
        <Route path="/financials" element={gatedPage("financials", "Financials", <FinancialsPage />)} />
      </Route>
    </Routes>
  );
}
