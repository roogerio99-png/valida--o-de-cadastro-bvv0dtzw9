import { useState } from 'react'
import { AlertTriangle, Trash2, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { limparBases } from '@/services/agroService'

interface ModalLimparBaseProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alvo: 'todas' | 'base_mestre' | 'dicionario_principios_ativos'
  tituloAlvo: string
  onSucesso: () => void
}

export function ModalLimparBase({
  open,
  onOpenChange,
  alvo,
  tituloAlvo,
  onSucesso,
}: ModalLimparBaseProps) {
  const { isAdmin } = useAuth()
  const [confirmacaoTexto, setConfirmacaoTexto] = useState('')
  const [executando, setExecutando] = useState(false)

  const ehValido = confirmacaoTexto.trim() === 'LIMPAR'

  const handleLimpar = async () => {
    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description: 'Apenas administradores podem realizar esta ação.',
      })
      return
    }
    if (!ehValido) return
    setExecutando(true)

    try {
      const res = await limparBases({
        alvo,
        confirmar: 'LIMPAR',
      })

      const totalApagado = res.apagados.total
      const detalheMsg =
        alvo === 'todas'
          ? `${res.apagados.base_mestre} produtos e ${res.apagados.dicionario_principios_ativos} princípios ativos apagados.`
          : alvo === 'base_mestre'
            ? `${res.apagados.base_mestre} produtos apagados da Base Mestre.`
            : `${res.apagados.dicionario_principios_ativos} registros apagados do Dicionário.`

      toast({
        title: 'Base limpa com sucesso',
        description: `Total de ${totalApagado} registros removidos. ${detalheMsg}`,
      })

      setConfirmacaoTexto('')
      onOpenChange(false)
      onSucesso()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao executar a limpeza da base.'
      toast({
        variant: 'destructive',
        title: 'Erro na limpeza da base',
        description: msg,
      })
    } finally {
      setExecutando(false)
    }
  }

  const handleFechar = (novoOpen: boolean) => {
    if (!executando) {
      setConfirmacaoTexto('')
      onOpenChange(novoOpen)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleFechar}>
      <DialogContent className="max-w-md rounded-2xl border-red-200">
        <DialogHeader className="space-y-2">
          <div className="w-11 h-11 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center mx-auto sm:mx-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <DialogTitle className="text-base font-bold text-red-950">
            Limpar {tituloAlvo}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#5A6D5A] leading-relaxed">
            Esta ação é <strong className="text-red-700">irreversível</strong>. TODOS os registros
            da coleção selecionada serão apagados permanentemente do banco de dados para recomeçar
            do zero.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-2 text-xs">
          {!isAdmin ? (
            <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-red-800 flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
              <div>
                <strong>Acesso Restrito a Administradores</strong>
                <p className="mt-0.5">Seu perfil é de <strong>Analista</strong> (somente leitura). A exclusão e limpeza de bases é bloqueada.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Caixa de garantia de preservação */}
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[11px] text-emerald-950">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>O que permanece 100% intacto e protegido:</span>
                </div>
                <ul className="list-disc list-inside text-[11px] text-emerald-800 space-y-0.5 pl-1">
                  <li>Histórico de validações e logs de auditoria (sem perda)</li>
                  <li>Relatórios anteriores de sincronização e estatísticas</li>
                  <li>Regras fiscais NCM × Embalagem e Parametrização Tributária</li>
                  <li>Usuários e credenciais do sistema</li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#1C2B1C]">
                  Digite <span className="font-mono font-bold text-red-700">LIMPAR</span> para
                  confirmar:
                </Label>
                <Input
                  value={confirmacaoTexto}
                  onChange={(e) => setConfirmacaoTexto(e.target.value)}
                  placeholder="Digite LIMPAR"
                  disabled={executando}
                  className="h-9 text-xs font-mono font-bold tracking-wider uppercase border-red-300 focus-visible:ring-red-500"
                  autoFocus
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="pt-2 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleFechar(false)}
            disabled={executando}
            className="text-xs h-9"
          >
            Cancelar
          </Button>
          {isAdmin && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleLimpar}
              disabled={!ehValido || executando}
              className="text-xs h-9 bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5"
            >
              {executando ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Apagando registros...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  Confirmar Limpeza Total
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
