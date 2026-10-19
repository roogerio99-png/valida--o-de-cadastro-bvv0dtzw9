import { useState } from 'react'
import { Settings, ShieldCheck, Database, KeyRound, Bell, Server } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'

export default function Configuracoes() {
  const { user } = useAuth()
  const [notifValidation, setNotifValidation] = useState(true)
  const [autoSaveMaster, setAutoSaveMaster] = useState(false)
  const [enforceStrictNcm, setEnforceStrictNcm] = useState(true)

  const handleSaveConfigs = () => {
    toast({
      title: 'Configurações Salvas',
      description: 'Preferências do sistema foram atualizadas com sucesso.',
    })
  }

  return (
    <div className="space-y-6 animate-in fade-in-up duration-300 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
          <Settings className="w-6 h-6 text-[#1B5E20]" />
          <span>Configurações do Validador Agro</span>
        </h2>
        <p className="text-xs text-[#5A6D5A] mt-0.5">
          Ajustes operacionais do motor de auditoria, integrações e parâmetros da conta.
        </p>
      </div>

      {/* Conta do Usuário */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#1B5E20]" />
            <CardTitle className="text-sm font-bold text-[#1C2B1C]">
              Credenciais e Perfil de Acesso
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-[#5A6D5A]">
            Informações do usuário autenticado no Skip Cloud PocketBase
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC]">
            <div>
              <span className="text-[#5A6D5A] block text-[10px]">Nome de Exibição</span>
              <strong className="text-sm text-[#1C2B1C]">{user?.name || 'Administrador'}</strong>
            </div>
            <div>
              <span className="text-[#5A6D5A] block text-[10px]">E-mail Vinculado</span>
              <strong className="text-sm text-[#1C2B1C]">
                {user?.email || 'roogerio99@gmail.com'}
              </strong>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#5A6D5A]">
            <ShieldCheck className="w-4 h-4 text-[#2E7D32]" />
            <span>Permissões totais de leitura, auditoria e gravação nas collections.</span>
          </div>
        </CardContent>
      </Card>

      {/* Parâmetros do Motor de Validação */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[#F57F17]" />
            <CardTitle className="text-sm font-bold text-[#1C2B1C]">
              Regras e Diretrizes de Auditoria
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-[#5A6D5A]">
            Controle do rigor das 6 travas e salvamento automatizado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="flex items-center justify-between p-3 rounded-xl border border-[#DCE5DC]">
            <div className="space-y-0.5">
              <Label className="font-semibold text-[#1C2B1C] text-xs">
                Rigor Estrito de NCM (TIPI)
              </Label>
              <p className="text-[11px] text-[#5A6D5A]">
                Exige correspondência exata de 8 dígitos cadastrados na tabela regras_ncm_embalagem
              </p>
            </div>
            <Switch checked={enforceStrictNcm} onCheckedChange={setEnforceStrictNcm} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-[#DCE5DC]">
            <div className="space-y-0.5">
              <Label className="font-semibold text-[#1C2B1C] text-xs">
                Notificações de Alerta em Não-Conformidade
              </Label>
              <p className="text-[11px] text-[#5A6D5A]">
                Exibe toast sonoro e visual a cada disparo de trava que cause reprovação
              </p>
            </div>
            <Switch checked={notifValidation} onCheckedChange={setNotifValidation} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-[#DCE5DC]">
            <div className="space-y-0.5">
              <Label className="font-semibold text-[#1C2B1C] text-xs">
                Auto-salvar Produtos Aprovados
              </Label>
              <p className="text-[11px] text-[#5A6D5A]">
                Insere automaticamente na Base Mestre assim que todas as 6 travas forem aprovadas
              </p>
            </div>
            <Switch checked={autoSaveMaster} onCheckedChange={setAutoSaveMaster} />
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              onClick={handleSaveConfigs}
              className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white text-xs h-9 px-5"
            >
              Salvar Preferências
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Status da Conexão com Skip Cloud */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-[#1B5E20]" />
            <CardTitle className="text-sm font-bold text-[#1C2B1C]">
              Infraestrutura Backend e Sincronização
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="font-bold text-emerald-950">PocketBase Server</span>
              <p className="text-[11px] text-emerald-800">
                Hooks customizados ativos em /backend/v1/validar-produto
              </p>
            </div>
            <Badge className="bg-emerald-700 text-white text-[10px]">Operacional</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
