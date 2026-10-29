import React, { createContext, useContext, useEffect, useState } from 'react'
import type { AuthRecord } from 'pocketbase'
import pb from '@/lib/pocketbase/client'

export type UserRole = 'admin' | 'analista'

interface AuthContextType {
  user: AuthRecord | null
  token: string
  isAuthenticated: boolean
  isLoading: boolean
  role: UserRole
  isAdmin: boolean
  isAnalista: boolean
  login: (email: string, pass: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthRecord | null>(pb.authStore.record)
  const [token, setToken] = useState<string>(pb.authStore.token)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const refreshUser = async () => {
    try {
      if (pb.authStore.isValid) {
        const fresh = await pb.collection('users').authRefresh()
        setUser(fresh.record)
        setToken(fresh.token)
      }
    } catch (err) {
      console.warn('Falha ao atualizar dados da sessão:', err)
    }
  }

  useEffect(() => {
    // Escuta mudanças no authStore
    const unsubscribe = pb.authStore.onChange((newToken, record) => {
      setToken(newToken)
      setUser(record)
    })

    const initSession = async () => {
      if (pb.authStore.isValid) {
        setUser(pb.authStore.record)
        setToken(pb.authStore.token)
        await refreshUser()
      } else if (
        !import.meta.env.VITE_POCKETBASE_URL &&
        sessionStorage.getItem('validador_agro_logged_out') !== '1'
      ) {
        try {
          const authData = await pb
            .collection('users')
            .authWithPassword('roogerio99@gmail.com', 'Skip@Pass')
          setUser(authData.record)
          setToken(authData.token)
        } catch {
          pb.authStore.clear()
          setUser(null)
          setToken('')
        }
      } else {
        pb.authStore.clear()
        setUser(null)
        setToken('')
      }
      setIsLoading(false)
    }

    initSession()

    return () => {
      unsubscribe()
    }
  }, [])

  const login = async (email: string, pass: string) => {
    try {
      sessionStorage.removeItem('validador_agro_logged_out')
      const authData = await pb.collection('users').authWithPassword(email, pass)
      setUser(authData.record)
      setToken(authData.token)
    } catch (error) {
      console.error('Erro de autenticação:', error)
      throw error
    }
  }

  const logout = () => {
    sessionStorage.setItem('validador_agro_logged_out', '1')
    pb.authStore.clear()
    setUser(null)
    setToken('')
  }

  const userRole = (user as unknown as { role?: string })?.role
  const role: UserRole = userRole === 'admin' ? 'admin' : 'analista'
  const isAdmin = role === 'admin'
  const isAnalista = !isAdmin

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        role,
        isAdmin,
        isAnalista,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}
