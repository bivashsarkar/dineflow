import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'

import AdminLogin from './pages/admin/AdminLogin'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminRestaurants from './pages/admin/AdminRestaurants'
import AdminRestaurantForm from './pages/admin/AdminRestaurantForm'
import AdminRestaurantDetail from './pages/admin/AdminRestaurantDetail'

import OwnerLogin from './pages/owner/OwnerLogin'
import OwnerLayout from './pages/owner/OwnerLayout'
import OwnerDashboard from './pages/owner/OwnerDashboard'
import OwnerOrders from './pages/owner/OwnerOrders'
import OwnerMenu from './pages/owner/OwnerMenu'
import OwnerTables from './pages/owner/OwnerTables'
import OwnerRequests from './pages/owner/OwnerRequests'
import OwnerBilling from './pages/owner/OwnerBilling'

import CustomerPage from './pages/customer/CustomerPage'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      {/* ---------------- Platform Super Admin ---------------- */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="super_admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="restaurants" element={<AdminRestaurants />} />
        <Route path="restaurants/new" element={<AdminRestaurantForm />} />
        <Route path="restaurants/:id" element={<AdminRestaurantDetail />} />
        <Route path="restaurants/:id/edit" element={<AdminRestaurantForm />} />
      </Route>

      {/* ---------------- Restaurant Owner ---------------- */}
      <Route path="/owner/login" element={<OwnerLogin />} />
      <Route
        path="/owner"
        element={
          <ProtectedRoute role="owner">
            <OwnerLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/owner/dashboard" replace />} />
        <Route path="dashboard" element={<OwnerDashboard />} />
        <Route path="orders" element={<OwnerOrders />} />
        <Route path="menu" element={<OwnerMenu />} />
        <Route path="tables" element={<OwnerTables />} />
        <Route path="requests" element={<OwnerRequests />} />
        <Route path="billing" element={<OwnerBilling />} />
      </Route>

      {/* ---------------- Customer ordering website ---------------- */}
      <Route path="/r/:slug" element={<CustomerPage />} />
      <Route path="/r/:slug/table/:token" element={<CustomerPage />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
