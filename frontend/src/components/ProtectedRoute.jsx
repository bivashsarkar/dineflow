import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Guards a route for a specific role (super_admin | owner). */
export default function ProtectedRoute({ role, children }) {
  const { signedIn, role: currentRole } = useAuth()
  const location = useLocation()

  if (!signedIn) {
    const target = role === 'super_admin' ? '/admin/login' : '/owner/login'
    return <Navigate to={target} replace state={{ from: location.pathname }} />
  }
  if (role && currentRole !== role) {
    const target = currentRole === 'super_admin' ? '/admin/dashboard' : '/owner/dashboard'
    return <Navigate to={target} replace />
  }
  return children
}
