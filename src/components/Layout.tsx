import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  CheckCircle2,
  FileSpreadsheet,
  FlaskConical,
  Database,
  ShieldAlert,
  Percent,
  Scale,
  UploadCloud,
  CloudSync,
  LogOut,
  Menu,
  X,
  Sprout,
  Activity,
  ExternalLink,
  User,
  Search,
  Users,
  Shield,
  Eye,
  FileText,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/validar', label: 'Validar Produto', icon: CheckCircle2 },
  { path: '/sincronizacao', label: 'Sincronização de Produtos', icon: CloudSync },
  { path: '/regras', label: 'Regras NCM × Embalagem', icon: FileSpreadsheet },
  { path: '/principios-ativos', label: 'Princípios Ativos', icon: FlaskConical },
  { path: '/base-mestre', label: 'Base Mestre (Tributária)', icon: Database },
  { path: '/bula', label: 'Cadastro de Bula', icon: FileText },
  { path: '/travas', label: 'Travas de Auditoria', icon: ShieldAlert },
  { path: '/parametrizacao', label: 'Parametrização Fiscal', icon: Percent },
  { path: '/tributacao', label: 'Chat Especialista', icon: Scale },
  { path: '/importar', label: 'Importador', icon: UploadCloud },
  { path: '/configuracoes', label: 'Configurações', icon: User },
]

export function Layout() {
  const { user, logout, isAdmin, role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    // Redireciona para Base Mestre ou Regras com o termo de busca
    navigate(`/base-mestre?q=${encodeURIComponent(searchQuery)}`)
  }

  const navItemsFiltrados = [
    ...navItems,
    ...(isAdmin ? [{ path: '/usuarios', label: 'Gestão de Usuários', icon: Users }] : []),
  ]

  // Determina se a rota atual é de tabela que ocupa a tela sem scroll na página
  const isTablePage = [
    '/base-mestre',
    '/bula',
    '/cadastro-bula',
    '/principios-ativos',
    '/regras',
    '/regras-ncm',
    '/parametrizacao',
    '/parametrizacao-fiscal',
    '/tributacao',
    '/travas',
    '/sincronizacao',
    '/sincronizacao-produtos',
    '/usuarios',
  ].includes(location.pathname)

  // Título dinâmico da página atual
  const currentNav = navItemsFiltrados.find((item) => item.path === location.pathname)
  const pageTitle =
    currentNav?.label ||
    (location.pathname === '/regras-ncm'
      ? 'Regras NCM × Embalagem'
      : location.pathname === '/parametrizacao-fiscal'
        ? 'Parametrização Fiscal'
        : location.pathname === '/usuarios'
          ? 'Gestão de Usuários'
          : 'Validador Agro')

  return (
    <div className="flex h-screen h-[100dvh] w-screen overflow-hidden bg-[#F5F7F1] text-[#1C2B1C] font-sans select-none md:select-auto">
      {/* ------------------------------------------------------------------ */}
      {/* SIDEBAR DESKTOP */}
      {/* ------------------------------------------------------------------ */}
      <aside className="hidden lg:flex flex-col w-64 bg-[#0D2811] text-white shadow-xl flex-shrink-0 z-20">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-emerald-950/60 bg-[#091D0C]">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#1B5E20] to-[#2E7D32] flex items-center justify-center text-white shadow-md border border-emerald-600/40">
            <Sprout className="w-6 h-6 text-emerald-300" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight text-white flex items-center gap-1.5">
              Validador Agro
            </h1>
            <p className="text-xs text-emerald-400 font-medium">Auditoria e Compliance</p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItemsFiltrados.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 relative ${
                  isActive
                    ? 'bg-[#1B5E20] text-white shadow-sm font-semibold'
                    : 'text-emerald-100/80 hover:bg-emerald-900/40 hover:text-white'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-[#F57F17] rounded-r-full" />
                )}
                <Icon
                  className={`w-4.5 h-4.5 ${isActive ? 'text-[#F57F17]' : 'text-emerald-400/80'}`}
                />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* Sync & Database Status Badge */}
        <div className="p-4 mx-3 my-2 rounded-xl bg-emerald-950/70 border border-emerald-800/40">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-emerald-300/80 font-medium flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              Banco Conectado
            </span>
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#22c55e]" />
          </div>
          <p className="text-[11px] text-emerald-200/60 leading-relaxed">
            PocketBase v0.36 Realtime ativo
          </p>
        </div>

        {/* User Card Bottom */}
        <div className="p-3 border-t border-emerald-950/70 bg-[#091D0C] flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar className="w-8 h-8 border border-emerald-600/50">
              <AvatarFallback className="bg-[#1B5E20] text-emerald-200 text-xs font-semibold">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : isAdmin ? 'AD' : 'AN'}
              </AvatarFallback>
            </Avatar>
            <div className="truncate">
              <p className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                <span>{user?.name || user?.email || 'Usuário Agro'}</span>
              </p>
              <div className="flex items-center gap-1 text-[10px]">
                {isAdmin ? (
                  <span className="text-emerald-300 font-semibold flex items-center gap-0.5">
                    <Shield className="w-3 h-3" /> Admin
                  </span>
                ) : (
                  <span className="text-sky-300 font-medium flex items-center gap-0.5">
                    <Eye className="w-3 h-3" /> Analista
                  </span>
                )}
                <span className="text-emerald-400/60">•</span>
                <span className="text-emerald-400/80 truncate">{user?.email || ''}</span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Sair do sistema"
            className="text-emerald-400 hover:text-white hover:bg-emerald-900/60 h-8 w-8 shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* DRAWER MOBILE */}
      {/* ------------------------------------------------------------------ */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative flex flex-col w-72 bg-[#0D2811] text-white h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-950/60">
              <div className="flex items-center gap-2.5">
                <Sprout className="w-6 h-6 text-emerald-400" />
                <span className="font-bold text-white text-base">Validador Agro</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="text-emerald-300 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {navItemsFiltrados.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium ${
                      isActive
                        ? 'bg-[#1B5E20] text-white font-semibold'
                        : 'text-emerald-100/80 hover:bg-emerald-900/40 hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5 text-emerald-400" />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </nav>
            <div className="p-4 border-t border-emerald-950/70 bg-[#091D0C]">
              <Button
                variant="destructive"
                className="w-full justify-center gap-2 bg-red-700 hover:bg-red-800"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
                Sair
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* ÁREA PRINCIPAL + HEADER + CONTEÚDO + FOOTER */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header Superior */}
        <header className="h-16 bg-white border-b border-[#DCE5DC] px-4 lg:px-8 flex items-center justify-between flex-shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-[#1C2B1C] hover:bg-emerald-50 rounded-lg"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="truncate">
              <h2 className="text-lg lg:text-xl font-bold text-[#1C2B1C] truncate">{pageTitle}</h2>
            </div>
          </div>

          {/* Busca Rápida + Status + Perfil */}
          <div className="flex items-center gap-3">
            <form onSubmit={handleGlobalSearch} className="hidden md:flex relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6D5A]" />
              <Input
                type="text"
                placeholder="Buscar produto, NCM..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 h-9 text-xs rounded-full bg-[#F5F7F1] border-[#DCE5DC] focus-visible:ring-1 focus-visible:ring-[#1B5E20]"
              />
            </form>

            {/* Status Indicador Live */}
            <Badge
              variant="outline"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-emerald-50 text-emerald-800 border-emerald-200"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              Sincronizado
            </Badge>

            {/* Menu Dropdown do Usuário */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-9 w-9 rounded-full ring-1 ring-[#DCE5DC] p-0"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-[#1B5E20] text-white text-xs font-semibold">
                      {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AG'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium leading-none text-[#1C2B1C]">
                        {user?.name || (isAdmin ? 'Administrador' : 'Analista')}
                      </p>
                      {isAdmin ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                          Admin
                        </span>
                      ) : (
                        <span className="text-[10px] bg-blue-100 text-blue-800 font-medium px-1.5 py-0.5 rounded">
                          Analista
                        </span>
                      )}
                    </div>
                    <p className="text-xs leading-none text-[#5A6D5A]">{user?.email || ''}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/validar')} className="cursor-pointer">
                  <CheckCircle2 className="mr-2 h-4 h-4 text-[#1B5E20]" />
                  <span>Nova Validação</span>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem
                    onClick={() => navigate('/importar')}
                    className="cursor-pointer"
                  >
                    <UploadCloud className="mr-2 h-4 h-4 text-[#F57F17]" />
                    <span>Importador</span>
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem
                    onClick={() => navigate('/usuarios')}
                    className="cursor-pointer text-emerald-800 font-medium"
                  >
                    <Users className="mr-2 h-4 h-4 text-emerald-600" />
                    <span>Gestão de Usuários</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => navigate('/configuracoes')}
                  className="cursor-pointer"
                >
                  <User className="mr-2 h-4 h-4 text-[#1B5E20]" />
                  <span>Configurações</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600">
                  <LogOut className="mr-2 h-4 h-4" />
                  <span>Sair da conta</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Conteúdo: Em telas de tabela como Base Mestre o scroll é delegado 100% à tabela interna */}
        <main
          className={cn(
            'flex-1 w-full mx-auto px-4 lg:px-8 py-4 min-h-0 flex flex-col',
            isTablePage
              ? 'overflow-hidden max-w-[1600px]'
              : 'overflow-y-auto max-w-[1400px] custom-scrollbar',
          )}
        >
          <Outlet />
        </main>

        {/* Footer com versão e link TIPI */}
        <footer className="h-10 bg-white border-t border-[#DCE5DC] px-4 lg:px-8 flex items-center justify-between text-xs text-[#5A6D5A] flex-shrink-0">
          <div>
            <span>Validador Agro v0.0.124 • Sistema de Auditoria de Produtos Agropecuários</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/classificacao-fiscal-de-mercadorias/tabela-tipi"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#1B5E20] hover:underline flex items-center gap-1 font-medium"
            >
              <span>Tabela TIPI Oficial</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}
