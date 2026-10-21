import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { EsqueciSenha } from './pages/EsqueciSenha'
import { RedefinirSenha } from './pages/RedefinirSenha'
import { Dashboard } from './pages/Dashboard'
import { Validar } from './pages/Validar'
import { BaseMestre } from './pages/BaseMestre'
import { PrincipiosAtivos } from './pages/PrincipiosAtivos'
import { Regras } from './pages/Regras'
import { Parametrizacao } from './pages/Parametrizacao'
import { Travas } from './pages/Travas'
import { SincronizacaoProdutos } from './pages/SincronizacaoProdutos'
import { Tributacao } from './pages/Tributacao'
import { Importar } from './pages/Importar'
import { Configuracoes } from './pages/Configuracoes'
import { Usuarios } from './pages/Usuarios'
import { NotFound } from './pages/NotFound'
import { AuthProvider } from './contexts/AuthContext'
import { Toaster } from './components/ui/toaster'
import { TooltipProvider } from './components/ui/tooltip'

export function App() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <Router>
          <Routes>
            {/* Rotas Públicas */}
            <Route path="/login" element={<Login />} />
            <Route path="/esqueci-senha" element={<EsqueciSenha />} />
            <Route path="/redefinir-senha" element={<RedefinirSenha />} />

            {/* Rotas Protegidas dentro do Layout */}
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
              <Route path="/base-mestre" element={<BaseMestre />} />
              <Route path="/principios-ativos" element={<PrincipiosAtivos />} />
              <Route path="/regras" element={<Regras />} />
              <Route path="/parametrizacao" element={<Parametrizacao />} />
              <Route path="/travas" element={<Travas />} />
              <Route path="/sincronizacao" element={<SincronizacaoProdutos />} />
              <Route
                path="/sincronizacao-produtos"
                element={<Navigate to="/sincronizacao" replace />}
              />
              <Route
                path="/parametrizacao-fiscal"
                element={<Navigate to="/parametrizacao" replace />}
              />
              <Route path="/tributacao" element={<Tributacao />} />
              <Route
                path="/usuarios"
                element={
                  <ProtectedRoute requireAdmin>
                    <Usuarios />
                  </ProtectedRoute>
                }
              />
              <Route path="/importar" element={<Importar />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster />
        </Router>
      </TooltipProvider>
    </AuthProvider>
  )
}

export default App
