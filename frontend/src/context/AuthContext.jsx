import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { clearAuth, getRole, getToken, setAuth } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getToken())
  const [role, setRole] = useState(() => getRole())

  const signIn = useCallback((newToken, newRole) => {
    setAuth(newToken, newRole)
    setToken(newToken)
    setRole(newRole)
  }, [])

  const signOut = useCallback(() => {
    clearAuth()
    setToken('')
    setRole('')
  }, [])

  const value = useMemo(
    () => ({ token, role, signedIn: Boolean(token), signIn, signOut }),
    [token, role, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
