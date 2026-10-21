import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAdmin = false,
}) => {
  const { isAuthenticated, isLoading, isAdmin } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F5F7F1]">
        <Loader2 className="w-10 h-10 animate-spin text-[#1B5E20] mb-4" />
        <p className="text-[#5A6D5A] font-medium text-sm">Carregando credenciais...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
