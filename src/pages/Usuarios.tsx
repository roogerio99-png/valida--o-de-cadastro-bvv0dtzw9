import React, { useState, useEffect, useTransition } from 'react'
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Mail,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Copy,
  ExternalLink,
  Info,
  Clock,
  Eye,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import {
  listarUsuarios,
  convidarUsuario,
  alterarPapelUsuario,
  excluirUsuario,
  cancelarConvite,
  UsuarioItem,
  ConviteItem,
  ConvidarUsuarioResponse,
} from '@/services/usuariosService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function Usuarios() {
  const { user, isAdmin } = useAuth()
  const { toast } = useToast()
  const [, startTransition] = useTransition()

  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([])
  const [convites, setConvites] = useState<ConviteItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('')

  // Modal Convidar
  const [modalConvidarAberto, setModalConvidarAberto] = useState(false)
  const [emailConvite, setEmailConvite] = useState('')
  const [nomeConvite, setNomeConvite] = useState('')
  const [papelConvite, setPapelConvite] = useState<'admin' | 'analista'>('analista')
  const [enviandoConvite, setEnviandoConvite] = useState(false)
  const [resultadoConvite, setResultadoConvite] = useState<ConvidarUsuarioResponse | null>(null)

  // Confirmação de exclusão/cancelamento
  const [itemParaExcluir, setItemParaExcluir] = useState<{
    tipo: 'usuario' | 'convite'
    id: string
    nome: string
    email: string
  } | null>(null)
  const [executandoExclusao, setExecutandoExclusao] = useState(false)

  // Alteração de papel
  const [alterandoPapelId, setAlterandoPapelId] = useState<string | null>(null)

  const carregarDados = async () => {
    setCarregando(true)
    try {
      const resp = await listarUsuarios()
      if (resp.sucesso) {
        setUsuarios(resp.usuarios || [])
        setConvites(resp.convites || [])
      } else {
        toast({
          title: 'Erro ao carregar usuários',
          description: resp.error || 'Não foi possível carregar a lista de usuários.',
          variant: 'destructive',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na comunicação com o servidor'
      toast({
        title: 'Erro de conexão',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (isAdmin) {
      carregarDados()
    }
  }, [isAdmin])

  // Se não for admin, bloqueia o acesso na UI também
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center text-red-600 dark:text-red-400">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Acesso Restrito
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Apenas administradores do sistema têm permissão para acessar a gestão de usuários e convites.
          </p>
        </div>
      </div>
    )
  }

  const handleEnviarConvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailConvite || !emailConvite.includes('@')) {
      toast({
        title: 'E-mail inválido',
        description: 'Informe um endereço de e-mail corporativo válido.',
        variant: 'destructive',
      })
      return
    }

    setEnviandoConvite(true)
    try {
      const resp = await convidarUsuario({
        email: emailConvite,
        nome: nomeConvite,
        role: papelConvite,
      })

      if (resp.sucesso) {
        setResultadoConvite(resp)
        toast({
          title: 'Convite processado com sucesso!',
          description: resp.email_enviado
            ? `E-mail enviado para ${resp.email}.`
            : 'Usuário cadastrado. Utilize o link de primeiro acesso exibido.',
        })
        startTransition(() => {
          carregarDados()
        })
      } else {
        toast({
          title: 'Não foi possível convidar',
          description: resp.error || 'Ocorreu um erro ao processar o convite.',
          variant: 'destructive',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao convidar usuário'
      toast({
        title: 'Erro ao enviar convite',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setEnviandoConvite(false)
    }
  }

  const handleAlterarPapel = async (userId: string, novoPapel: 'admin' | 'analista') => {
    setAlterandoPapelId(userId)
    try {
      const resp = await alterarPapelUsuario(userId, novoPapel)
      if (resp.sucesso) {
        toast({
          title: 'Papel atualizado',
          description: resp.mensagem,
        })
        setUsuarios((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: novoPapel } : u)),
        )
      } else {
        toast({
          title: 'Erro ao alterar papel',
          description: resp.error || 'Não foi possível alterar a permissão do usuário.',
          variant: 'destructive',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na alteração de papel'
      toast({
        title: 'Erro de permissão',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setAlterandoPapelId(null)
    }
  }

  const handleConfirmarExclusao = async () => {
    if (!itemParaExcluir) return
    setExecutandoExclusao(true)

    try {
      if (itemParaExcluir.tipo === 'convite') {
        const resp = await cancelarConvite(itemParaExcluir.id)
        if (resp.sucesso) {
          toast({
            title: 'Convite cancelado',
            description: resp.mensagem,
          })
          setConvites((prev) => prev.filter((c) => c.id !== itemParaExcluir.id))
        } else {
          toast({
            title: 'Erro ao cancelar convite',
            description: resp.error || 'Não foi possível cancelar o convite.',
            variant: 'destructive',
          })
        }
      } else {
        const resp = await excluirUsuario(itemParaExcluir.id)
        if (resp.sucesso) {
          toast({
            title: 'Usuário removido',
            description: resp.mensagem,
          })
          setUsuarios((prev) => prev.filter((u) => u.id !== itemParaExcluir.id))
        } else {
          toast({
            title: 'Erro ao remover usuário',
            description: resp.error || 'Não foi possível excluir o usuário.',
            variant: 'destructive',
          })
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro na exclusão'
      toast({
        title: 'Erro na operação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setExecutandoExclusao(false)
      setItemParaExcluir(null)
    }
  }

  const copiarParaTransferencia = (texto: string, rotulo: string) => {
    navigator.clipboard.writeText(texto)
    toast({
      title: `${rotulo} copiado!`,
      description: 'O texto foi copiado para a área de transferência.',
    })
  }

  const usuariosFiltrados = usuarios.filter((u) => {
    const termo = filtro.toLowerCase()
    return (
      u.email.toLowerCase().includes(termo) ||
      (u.name && u.name.toLowerCase().includes(termo)) ||
      u.role.toLowerCase().includes(termo)
    )
  })

  const convitesFiltrados = convites.filter((c) => {
    const termo = filtro.toLowerCase()
    return (
      c.email.toLowerCase().includes(termo) ||
      (c.nome && c.nome.toLowerCase().includes(termo))
    )
  })

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Administração de Usuários
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Controle multiusuário com entrada restrita por convite e 2 níveis de acesso (Administrador e Analista).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={carregando}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            onClick={() => {
              setEmailConvite('')
              setNomeConvite('')
              setPapelConvite('analista')
              setResultadoConvite(null)
              setModalConvidarAberto(true)
            }}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <UserPlus className="w-4 h-4" />
            Convidar Usuário
          </Button>
        </div>
      </div>

      {/* Regras e Informações dos Papéis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <ShieldCheck className="w-4 h-4" />
              Administrador (Acesso Total)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <p>• Pode importar planilhas e gravar cadastros na Base Mestre.</p>
            <p>• Sincroniza produtos via API e aciona atualização em cascata.</p>
            <p>• Gerencia matriz de princípios ativos, regras fiscais e limpa bases.</p>
            <p>• Envia convites, gerencia e altera papéis dos usuários.</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900/50 dark:bg-blue-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-blue-800 dark:text-blue-300">
              <Eye className="w-4 h-4" />
              Analista (Modo Visualização)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <p>• Navegação completa, filtros, consultas e conferência de regras.</p>
            <p>• Execução de validação de consulta para análise (sem gravar).</p>
            <p>• Exportação de relatórios e relatórios de duplicidades.</p>
            <p>• <strong className="text-red-600 dark:text-red-400">Bloqueado:</strong> sem inclusão, sem edição, sem exclusão e sem gravação na base.</p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtro */}
      <div className="flex items-center gap-4">
        <Input
          placeholder="Filtrar por nome, e-mail ou papel..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="max-w-sm"
        />
        <div className="text-xs text-slate-500">
          Total: {usuarios.length} usuário(s) ativos | {convites.length} convite(s) pendente(s)
        </div>
      </div>

      {/* Tabs: Usuários Ativos e Convites Pendentes */}
      <Tabs defaultValue="usuarios" className="w-full">
        <TabsList className="grid w-full sm:w-[400px] grid-cols-2">
          <TabsTrigger value="usuarios" className="gap-2">
            <Users className="w-4 h-4" />
            Usuários ({usuariosFiltrados.length})
          </TabsTrigger>
          <TabsTrigger value="convites" className="gap-2">
            <Mail className="w-4 h-4" />
            Convites Pendentes ({convitesFiltrados.length})
          </TabsTrigger>
        </TabsList>

        {/* Tabela de Usuários */}
        <TabsContent value="usuarios" className="space-y-4 pt-2">
          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-medium">
                <tr>
                  <th className="py-3 px-4">Usuário</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4">Papel Atual</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Cadastrado em</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {carregando ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                      Carregando usuários do sistema...
                    </td>
                  </tr>
                ) : usuariosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Nenhum usuário encontrado com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  usuariosFiltrados.map((u) => {
                    const isSelf = user?.id === u.id
                    const isRootAdmin = u.email === 'roogerio99@gmail.com'
                    const ehAdmin = u.role === 'admin'

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <span>{u.name || 'Sem nome informado'}</span>
                            {isSelf && (
                              <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700">
                                Você
                              </Badge>
                            )}
                            {isRootAdmin && (
                              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40">
                                Principal
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono text-xs">
                          {u.email}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {ehAdmin ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 font-medium">
                                <ShieldCheck className="w-3 h-3" />
                                Administrador
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1 font-medium text-slate-700 dark:text-slate-200">
                                <Eye className="w-3 h-3 text-blue-500" />
                                Analista (Leitura)
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {u.verified ? (
                            <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 gap-1 text-[11px]">
                              <CheckCircle2 className="w-3 h-3" />
                              Verificado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-300 bg-amber-50 dark:bg-amber-950/40 gap-1 text-[11px]">
                              <Clock className="w-3 h-3" />
                              Primeiro acesso pendente
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-xs">
                          {u.created ? new Date(u.created).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Troca de Papel */}
                            {!isRootAdmin && !isSelf ? (
                              <Select
                                value={u.role}
                                disabled={alterandoPapelId === u.id}
                                onValueChange={(val: 'admin' | 'analista') => handleAlterarPapel(u.id, val)}
                              >
                                <SelectTrigger className="h-8 w-[140px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Administrador</SelectItem>
                                  <SelectItem value="analista">Analista</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic px-2">
                                {isRootAdmin ? 'Admin Permanente' : 'Sua Conta'}
                              </span>
                            )}

                            {/* Excluir usuário */}
                            {!isRootAdmin && !isSelf && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setItemParaExcluir({
                                    tipo: 'usuario',
                                    id: u.id,
                                    nome: u.name || u.email,
                                    email: u.email,
                                  })
                                }
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50"
                                title="Excluir Usuário"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tabela de Convites Pendentes */}
        <TabsContent value="convites" className="space-y-4 pt-2">
          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-medium">
                <tr>
                  <th className="py-3 px-4">Convidado</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4">Papel Atribuído</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Enviado em</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {carregando ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                      Carregando convites pendentes...
                    </td>
                  </tr>
                ) : convitesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Nenhum convite pendente no momento. Utilize o botão "Convidar Usuário" acima para adicionar membros.
                    </td>
                  </tr>
                ) : (
                  convitesFiltrados.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {c.nome || 'Convidado'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono text-xs">
                        {c.email}
                      </td>
                      <td className="py-3 px-4">
                        {c.role === 'admin' ? (
                          <Badge className="bg-emerald-600 text-white font-medium text-[11px]">
                            Administrador
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="font-medium text-[11px]">
                            Analista
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 text-[11px] gap-1">
                          <Clock className="w-3 h-3" />
                          Aguardando Acesso
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-xs">
                        {c.created ? new Date(c.created).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {c.link_definicao_senha && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs"
                              onClick={() => {
                                const urlCompleta = window.location.origin + c.link_definicao_senha
                                copiarParaTransferencia(urlCompleta, 'Link de acesso')
                              }}
                              title="Copiar link de primeiro acesso"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copiar Link
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setItemParaExcluir({
                                tipo: 'convite',
                                id: c.id,
                                nome: c.nome || c.email,
                                email: c.email,
                              })
                            }
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50"
                            title="Cancelar Convite"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal Convidar Usuário */}
      <Dialog open={modalConvidarAberto} onOpenChange={setModalConvidarAberto}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-600" />
              Convidar Novo Usuário
            </DialogTitle>
            <DialogDescription>
              O sistema é restrito a convites. O novo usuário receberá acesso com o papel atribuído.
            </DialogDescription>
          </DialogHeader>

          {!resultadoConvite ? (
            <form onSubmit={handleEnviarConvite} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="convite-email">E-mail Corporativo *</Label>
                <Input
                  id="convite-email"
                  type="email"
                  placeholder="exemplo@empresa.com.br"
                  value={emailConvite}
                  onChange={(e) => setEmailConvite(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="convite-nome">Nome Completo</Label>
                <Input
                  id="convite-nome"
                  type="text"
                  placeholder="Nome do colaborador"
                  value={nomeConvite}
                  onChange={(e) => setNomeConvite(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="convite-papel">Papel / Nível de Acesso</Label>
                <Select
                  value={papelConvite}
                  onValueChange={(val: 'admin' | 'analista') => setPapelConvite(val)}
                >
                  <SelectTrigger id="convite-papel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="analista">
                      <div className="text-left">
                        <div className="font-medium">Analista (Recomendado por padrão)</div>
                        <div className="text-xs text-slate-500">Visualização, filtros, consultas e conferência. Sem gravação.</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="text-left">
                        <div className="font-medium text-emerald-700 dark:text-emerald-400">Administrador</div>
                        <div className="text-xs text-slate-500">Acesso total: importação, gravação, sincronização e gestão de usuários.</div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 p-3 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  Por diretriz de segurança, novos membros ingressam preferencialmente como <strong>Analistas</strong>. Administradores podem promover analistas a qualquer momento nesta tela.
                </p>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalConvidarAberto(false)}
                  disabled={enviandoConvite}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={enviandoConvite}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {enviandoConvite ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Enviar Convite
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            /* Tela de Resultado do Convite (com link de fallback) */
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div className="text-sm font-medium">
                  {resultadoConvite.mensagem}
                </div>
              </div>

              {resultadoConvite.aviso_email && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Aviso sobre envio de e-mail:</strong>
                    <p className="mt-0.5">{resultadoConvite.aviso_email}</p>
                  </div>
                </div>
              )}

              {/* Credenciais e Link de Primeiro Acesso */}
              <div className="space-y-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Dados de Acesso para o Convidado
                </div>

                <div>
                  <div className="text-xs text-slate-500">E-mail:</div>
                  <div className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                    {resultadoConvite.email}
                  </div>
                </div>

                {resultadoConvite.senha_temporaria && (
                  <div>
                    <div className="text-xs text-slate-500">Senha Provisória Gerada:</div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="px-2 py-1 bg-white dark:bg-slate-800 border rounded font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {resultadoConvite.senha_temporaria}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1"
                        onClick={() =>
                          copiarParaTransferencia(
                            resultadoConvite.senha_temporaria || '',
                            'Senha temporária',
                          )
                        }
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar
                      </Button>
                    </div>
                  </div>
                )}

                {resultadoConvite.link_primeiro_acesso && (
                  <div>
                    <div className="text-xs text-slate-500">Link de Redefinição / Primeiro Acesso:</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        readOnly
                        value={window.location.origin + resultadoConvite.link_primeiro_acesso}
                        className="font-mono text-xs h-8 bg-white dark:bg-slate-800"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 gap-1 shrink-0"
                        onClick={() =>
                          copiarParaTransferencia(
                            window.location.origin + (resultadoConvite.link_primeiro_acesso || ''),
                            'Link de acesso',
                          )
                        }
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  onClick={() => {
                    setModalConvidarAberto(false)
                    setResultadoConvite(null)
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Concluir
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmação de Exclusão */}
      <AlertDialog open={!!itemParaExcluir} onOpenChange={(open) => !open && setItemParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {itemParaExcluir?.tipo === 'convite' ? 'Cancelar Convite?' : 'Excluir Usuário?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {itemParaExcluir?.tipo === 'convite' ? (
                <>
                  Deseja realmente cancelar o convite para <strong>{itemParaExcluir?.email}</strong>? O token de acesso provisório será invalidado.
                </>
              ) : (
                <>
                  Tem certeza que deseja remover o usuário <strong>{itemParaExcluir?.nome}</strong> ({itemParaExcluir?.email})?
                  O usuário perderá o acesso imediato à plataforma.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executandoExclusao}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarExclusao}
              disabled={executandoExclusao}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {executandoExclusao ? 'Processando...' : 'Confirmar Remoção'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
