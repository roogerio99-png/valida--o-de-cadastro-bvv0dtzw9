/* Main App Component - Handles routing (using react-router-dom), query client and other providers */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'

// Páginas de Autenticação
import Login from '@/pages/Login'
import EsqueciSenha from '@/pages/EsqueciSenha'
import RedefinirSenha from '@/pages/RedefinirSenha'

// Páginas do Sistema Agro
import Dashboard from '@/pages/Dashboard'
import Validar from '@/pages/Validar'
import Regras from '@/pages/Regras'
import PrincipiosAtivos from '@/pages/PrincipiosAtivos'
import BaseMestre from '@/pages/BaseMestre'
import Travas from '@/pages/Travas'
import Parametrizacao from '@/pages/Parametrizacao'
import Tributacao from '@/pages/Tributacao'
import Importar from '@/pages/Importar'
import Configuracoes from '@/pages/Configuracoes'
import NotFound from '@/pages/NotFound'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          {/* Rotas Públicas */}
          <Route path="/login" element={<Login />} />
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />

          {/* Rotas Protegidas com Layout Global */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/validar" element={<Validar />} />
            <Route path="/regras" element={<Regras />} />
            <Route path="/principios-ativos" element={<PrincipiosAtivos />} />
            <Route path="/base-mestre" element={<BaseMestre />} />
            <Route path="/travas" element={<Travas />} />
            <Route path="/parametrizacao" element={<Parametrizacao />} />
            <Route path="/tributacao" element={<Tributacao />} />
            <Route path="/importar" element={<Importar />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
