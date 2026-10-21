import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { ShieldCheck, Eye, Users, Settings, Bell, Database, Lock, KeyRound } from 'lucide-react'

export function Configuracoes() {
  const { user, isAdmin } = useAuth()
  const [notifValidation, setNotifValidation] = useState(true)
  const [autoSaveMaster, setAutoSaveMaster] = useState(false)
  const [cacheTipi, setCacheTipi] = useState(true)

  const handleSalvarPreferencias = () => {
    toast({
      title: 'Configurações salvas',
      description: 'Suas preferências locais foram atualizadas com sucesso.',
    })
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between pb-4 border-b border-[#DCE5DC]">
        <div>
          <h1 className="text-2xl font-bold text-[#1C2B1C] flex items-center gap-2">
            <Settings className="w-6 h-6 text-[#1B5E20]" />
            Configurações do Sistema
          </h1>
          <p className="text-sm text-[#5A6D5A] mt-1">
            Preferências de ambiente, parâmetros de auditoria e informações do usuário.
          </p>
        </div>
        {isAdmin && (
          <Button asChild className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white">
            <Link to="/usuarios">
              <Users className="w-4 h-4" />
              Gestão de Usuários
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card Perfil & Papel */}
        <Card className="border-[#DCE5DC] bg-white shadow-sm md:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-[#1C2B1C]">Perfil do Usuário</CardTitle>
            <CardDescription className="text-xs">Sua conta e permissão no sistema</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center text-center p-3 rounded-xl bg-[#F5F7F1]">
              <div className="w-16 h-16 rounded-full bg-[#1B5E20] text-white flex items-center justify-center font-bold text-xl mb-2">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : (isAdmin ? 'AD' : 'AN')}
              </div>
              <p className="font-semibold text-sm text-[#1C2B1C]">{user?.name || 'Usuário Agro'}</p>
              <p className="text-xs text-[#5A6D5A] font-mono break-all">{user?.email}</p>

              <div className="mt-3">
                {isAdmin ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 py-1 px-2.5 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Administrador
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1 py-1 px-2.5 font-medium text-blue-900 bg-blue-100 dark:bg-blue-950 dark:text-blue-300">
                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                    Analista (Visualização)
                  </Badge>
                )}
              </div>
            </div>

            <div className="text-xs text-[#5A6D5A] space-y-2 pt-2 border-t border-slate-100">
              <div className="flex justify-between">
                <span>Nível de Acesso:</span>
                <span className="font-medium text-[#1C2B1C]">{isAdmin ? 'Acesso Total' : 'Apenas Leitura'}</span>
              </div>
              <div className="flex justify-between">
                <span>ID da Conta:</span>
                <span className="font-mono text-[10px] text-slate-500">{user?.id?.slice(0, 10)}...</span>
              </div>
            </div>

            {isAdmin && (
              <Button asChild variant="outline" size="sm" className="w-full gap-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50">
                <Link to="/usuarios">
                  <Users className="w-4 h-4 text-emerald-600" />
                  Gerenciar Membros
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Card Preferências & Parâmetros */}
        <div className="space-y-6 md:col-span-2">
          <Card className="border-[#DCE5DC] bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-[#1C2B1C] flex items-center gap-2">
                <Database className="w-4 h-4 text-[#1B5E20]" />
                Preferências do Motor de Auditoria
              </CardTitle>
              <CardDescription className="text-xs">
                Ajuste o comportamento durante a execução de checagens fiscais e sanitárias.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium text-[#1C2B1C]">
                    Alertar inconsistências com som
                  </Label>
                  <p className="text-xs text-[#5A6D5A]">
                    Tocar notificação ao encontrar travas ou divergências críticas.
                  </p>
                </div>
                <Switch
                  checked={notifValidation}
                  onCheckedChange={setNotifValidation}
                />
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium text-[#1C2B1C]">
                    Cache Local da Tabela TIPI
                  </Label>
                  <p className="text-xs text-[#5A6D5A]">
                    Manter índices da tabela TIPI em memória para acelerar consultas.
                  </p>
                </div>
                <Switch
                  checked={cacheTipi}
                  onCheckedChange={setCacheTipi}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium text-[#1C2B1C]">
                    Gravação Automática na Base Mestre
                  </Label>
                  <p className="text-xs text-[#5A6D5A]">
                    Gravar diretamente após validação com score 100% (requer Admin).
                  </p>
                </div>
                <Switch
                  checked={autoSaveMaster}
                  onCheckedChange={setAutoSaveMaster}
                  disabled={!isAdmin}
                />
              </div>

              <div className="pt-3 flex justify-end">
                <Button
                  onClick={handleSalvarPreferencias}
                  className="bg-[#1B5E20] hover:bg-[#154a19] text-white"
                >
                  Salvar Preferências
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#DCE5DC] bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-[#1C2B1C] flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#1B5E20]" />
                Segurança e Acesso
              </CardTitle>
              <CardDescription className="text-xs">
                Política de permissões e controle de acesso baseado em papéis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-[#5A6D5A]">
              <div className="p-3 rounded-lg bg-[#F5F7F1] border border-[#DCE5DC] space-y-1.5">
                <p className="font-semibold text-slate-800">
                  {isAdmin ? 'Você está operando como ADMINISTRADOR' : 'Você está operando como ANALISTA'}
                </p>
                <p>
                  {isAdmin
                    ? 'Acesso total a todas as ferramentas, importação de planilhas, gravação na base mestre, sincronizações e gestão de novos membros.'
                    : 'Modo de visualização e consulta. Você pode validar cadastros para análise e exportar relatórios, mas não pode modificar a base de dados.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default Configuracoes
