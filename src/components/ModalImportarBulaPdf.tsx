import React, { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  analisarBulaPdf,
  gravarBulaPdf,
  RespostaAnaliseBulaPdf,
  RespostaGravacaoBulaPdf,
} from '@/services/agroService'
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Building2,
  FlaskConical,
  Package,
  Sprout,
  Target,
  ShieldCheck,
  Info,
  Check,
  X,
  FileCheck2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'

interface ModalImportarBulaPdfProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSucessoGravacao?: (resultado: RespostaGravacaoBulaPdf) => void
}

export function ModalImportarBulaPdf({
  open,
  onOpenChange,
  onSucessoGravacao,
}: ModalImportarBulaPdfProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [arquivo, setArquivo] = useState<File | null>(null)
  const [analisando, setAnalisando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [resultadoAnalise, setResultadoAnalise] = useState<RespostaAnaliseBulaPdf | null>(null)
  const [resultadoGravacao, setResultadoGravacao] = useState<RespostaGravacaoBulaPdf | null>(null)
  const [activeTab, setActiveTab] = useState<
    'checklist' | 'produto' | 'composicao' | 'empresas' | 'quadros' | 'aplicacao'
  >('checklist')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast({
          title: 'Formato inválido',
          description: 'Selecione um arquivo PDF de bula oficial.',
          variant: 'destructive',
        })
        return
      }
      setArquivo(file)
      setResultadoAnalise(null)
      setResultadoGravacao(null)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast({
          title: 'Formato inválido',
          description: 'Apenas arquivos com extensão .pdf são aceitos.',
          variant: 'destructive',
        })
        return
      }
      setArquivo(file)
      setResultadoAnalise(null)
      setResultadoGravacao(null)
    }
  }

  const handleAnalisarPdf = async () => {
    if (!arquivo) return
    setAnalisando(true)
    setResultadoAnalise(null)
    setResultadoGravacao(null)

    try {
      const res = await analisarBulaPdf(arquivo)
      if (res.sucesso) {
        setResultadoAnalise(res)
        toast({
          title: 'Bula analisada com sucesso!',
          description: `Identificado: ${res.dados_extraidos.produto.nome_comercial} (${res.dados_extraidos.produto.registro_mapa}). Verifique os dados antes de gravar.`,
        })
      } else {
        const msgErro =
          res.error || 'Não foi possível interpretar o conteúdo da bula. Tente novamente.'
        toast({
          title: 'Falha na análise da bula',
          description: `Erro ao analisar bula: ${msgErro}`,
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      console.error('Erro na análise da bula PDF:', err)
      const motivo = getErrorMessage(
        err,
        'Erro ao processar o arquivo PDF no servidor. Por favor, tente novamente.',
      )
      toast({
        title: 'Falha na leitura do PDF',
        description: `Erro ao analisar bula: ${motivo}`,
        variant: 'destructive',
      })
    } finally {
      setAnalisando(false)
    }
  }

  const handleGravarTudo = async () => {
    if (!resultadoAnalise || !resultadoAnalise.dados_extraidos) return
    setGravando(true)

    try {
      const res = await gravarBulaPdf(resultadoAnalise.dados_extraidos)
      if (res.sucesso) {
        setResultadoGravacao(res)
        toast({
          title: 'Cadastro de Bula gravado com sucesso!',
          description: `Produto ${res.nome_comercial} (MAPA ${res.registro_mapa}) inserido/atualizado na base.`,
        })
        if (onSucessoGravacao) {
          onSucessoGravacao(res)
        }
      } else {
        const msgErro = res.error || 'Falha na gravação dos registros no banco. Tente novamente.'
        toast({
          title: 'Erro ao gravar bula',
          description: `Erro ao gravar bula: ${msgErro}`,
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      console.error('Erro na gravação atômica da bula:', err)
      const motivo = getErrorMessage(
        err,
        'Falha de comunicação com o servidor ao persistir a bula. Por favor, tente novamente.',
      )
      toast({
        title: 'Erro ao gravar bula',
        description: `Erro ao gravar bula: ${motivo}`,
        variant: 'destructive',
      })
    } finally {
      setGravando(false)
    }
  }

  const resetar = () => {
    setArquivo(null)
    setResultadoAnalise(null)
    setResultadoGravacao(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const cl = resultadoAnalise?.checklist
  const dados = resultadoAnalise?.dados_extraidos

  return (
    <Dialog
      open={open}
      onOpenChange={(op) => {
        if (!analisando && !gravando) {
          onOpenChange(op)
          if (!op) resetar()
        }
      }}
    >
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 rounded-2xl overflow-hidden border-[#DCE5DC]">
        {/* CABEÇALHO */}
        <DialogHeader className="p-4 sm:p-5 bg-gradient-to-r from-[#1B5E20] to-[#2E7D32] text-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/20">
              <FileCheck2 className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Importação de Bula a partir de PDF</span>
                <Badge className="bg-emerald-400/20 text-emerald-100 border border-emerald-300/30 text-[10px]">
                  Extração Inteligente MAPA
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-emerald-100/80 mt-0.5">
                Envie a bula oficial em PDF de agrotóxico para preenchimento de todos os 7 blocos do
                Cadastro de Bula de uma única vez.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* CORPO DO MODAL */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs bg-[#FAFBF9]">
          {/* SUCESSO DE GRAVAÇÃO */}
          {resultadoGravacao && (
            <Card className="p-5 border-emerald-300 bg-emerald-50/70 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-emerald-900">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-sm">Bula Cadastrada com Sucesso!</h3>
                  <p className="text-xs text-emerald-800">
                    O produto comercial <strong>{resultadoGravacao.nome_comercial}</strong> com
                    registro MAPA <strong>{resultadoGravacao.registro_mapa}</strong> e todos os 6
                    blocos acessórios foram gravados com idempotência.
                  </p>
                </div>
              </div>

              {resultadoGravacao.contadores && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-emerald-200 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                    <span className="text-[#5A6D5A] block text-[11px]">Produto Principal</span>
                    <strong className="text-emerald-900 text-sm">
                      {resultadoGravacao.contadores.bula_produtos.inseridos +
                        resultadoGravacao.contadores.bula_produtos.atualizados}{' '}
                      item
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                    <span className="text-[#5A6D5A] block text-[11px]">Composição</span>
                    <strong className="text-emerald-900 text-sm">
                      {resultadoGravacao.contadores.bula_composicao.inseridos +
                        resultadoGravacao.contadores.bula_composicao.atualizados}{' '}
                      itens
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                    <span className="text-[#5A6D5A] block text-[11px]">Empresas da Cadeia</span>
                    <strong className="text-emerald-900 text-sm">
                      {resultadoGravacao.contadores.bula_empresas.inseridos +
                        resultadoGravacao.contadores.bula_empresas.atualizados}{' '}
                      empresas
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                    <span className="text-[#5A6D5A] block text-[11px]">Culturas / Alvos</span>
                    <strong className="text-emerald-900 text-sm">
                      {resultadoGravacao.contadores.bula_culturas.inseridos +
                        resultadoGravacao.contadores.bula_culturas.atualizados}{' '}
                      cult. /{' '}
                      {resultadoGravacao.contadores.bula_alvos.inseridos +
                        resultadoGravacao.contadores.bula_alvos.atualizados}{' '}
                      alvos
                    </strong>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetar}
                  className="rounded-xl border-emerald-300 text-emerald-800 hover:bg-emerald-100/50"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Importar Outro PDF
                </Button>
                <Button
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white rounded-xl"
                >
                  Concluir e Ver no Cadastro
                </Button>
              </div>
            </Card>
          )}

          {/* ÁREA DE UPLOAD E CONTROLES */}
          {!resultadoGravacao && (
            <>
              {/* Card de Informações/Instruções breves */}
              <div className="p-3 bg-emerald-50/60 border border-emerald-200/60 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold text-emerald-950">
                    Como funciona o processamento de Bula PDF:
                  </span>{' '}
                  O motor server-side converte o documento preservando tabelas e seções oficiais do
                  MAPA. Identifica registro MAPA, nome comercial, composição, empresas (titular,
                  fabricante técnico, formuladores, importador), toxicologia, alvos, doses e modo de
                  aplicação. Nenhum dado é descartado: seções adicionais permanecem preservadas na
                  íntegra em <code>dados_extras</code>.
                </div>
              </div>

              {/* Dropzone de Arquivo */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => !analisando && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  arquivo
                    ? 'border-emerald-400 bg-emerald-50/40'
                    : 'border-[#DCE5DC] hover:border-emerald-400 hover:bg-white bg-white/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={analisando}
                />
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100/80 text-emerald-800 flex items-center justify-center shadow-inner">
                    <UploadCloud className="w-6 h-6 text-[#1B5E20]" />
                  </div>
                  {arquivo ? (
                    <div>
                      <p className="font-bold text-sm text-[#1C2B1C]">{arquivo.name}</p>
                      <p className="text-xs text-[#5A6D5A]">
                        {(arquivo.size / (1024 * 1024)).toFixed(2)} MB • Clique para trocar de
                        arquivo
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-semibold text-sm text-[#1C2B1C]">
                        Arraste a bula PDF aqui ou clique para selecionar
                      </p>
                      <p className="text-xs text-[#5A6D5A] mt-0.5">
                        Exemplo: <code>roundup_original_mais.pdf</code> (até 10 MB)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Botão de Análise */}
              {arquivo && !resultadoAnalise && (
                <div className="flex justify-end">
                  <Button
                    onClick={handleAnalisarPdf}
                    disabled={analisando}
                    className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white rounded-xl shadow-sm text-xs h-9 px-4 flex items-center gap-2"
                  >
                    {analisando ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Analisando e interpretando seções da bula...</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4 text-emerald-200" />
                        <span>Analisar Conteúdo da Bula</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* PAINEL DE PRÉ-VISUALIZAÇÃO COMPLETA */}
          {resultadoAnalise && !resultadoGravacao && (
            <div className="space-y-4 pt-1">
              {/* Banner de Resumo da Detecção */}
              <div className="p-3.5 bg-white border border-[#DCE5DC] rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-[#1C2B1C]">
                      {dados?.produto.nome_comercial}
                    </span>
                    <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 font-mono text-xs">
                      MAPA {dados?.produto.registro_mapa}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-emerald-200 text-emerald-800 bg-emerald-50 text-[11px]"
                    >
                      {dados?.produto.tipo_formulacao}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#5A6D5A]">
                    Titular:{' '}
                    <strong className="text-[#1C2B1C]">
                      {dados?.produto.titular_registro || 'Identificado'}
                    </strong>{' '}
                    • Princípio Ativo:{' '}
                    <strong className="text-[#1C2B1C]">{dados?.produto.principio_ativo}</strong>
                  </p>
                </div>

                <Button
                  onClick={handleGravarTudo}
                  disabled={gravando}
                  className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white rounded-xl shadow-sm text-xs h-9 px-4 flex items-center gap-1.5 flex-shrink-0"
                >
                  {gravando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Gravando no Banco de Dados...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirmar e Gravar Cadastro</span>
                    </>
                  )}
                </Button>
              </div>

              {/* TABS DE INSPEÇÃO */}
              <Tabs
                value={activeTab}
                onValueChange={(v: any) => setActiveTab(v)}
                className="w-full"
              >
                <TabsList className="grid grid-cols-3 sm:grid-cols-6 h-auto p-1 bg-[#F5F7F1] rounded-xl gap-1">
                  <TabsTrigger
                    value="checklist"
                    className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#1B5E20] data-[state=active]:shadow-sm"
                  >
                    Status / Checklist
                  </TabsTrigger>
                  <TabsTrigger
                    value="produto"
                    className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#1B5E20] data-[state=active]:shadow-sm"
                  >
                    Produto Principal
                  </TabsTrigger>
                  <TabsTrigger
                    value="composicao"
                    className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#1B5E20] data-[state=active]:shadow-sm"
                  >
                    Composição ({dados?.composicao.length || 0})
                  </TabsTrigger>
                  <TabsTrigger
                    value="empresas"
                    className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#1B5E20] data-[state=active]:shadow-sm"
                  >
                    Empresas ({dados?.empresas.length || 0})
                  </TabsTrigger>
                  <TabsTrigger
                    value="quadros"
                    className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#1B5E20] data-[state=active]:shadow-sm"
                  >
                    Culturas e Alvos
                  </TabsTrigger>
                  <TabsTrigger
                    value="aplicacao"
                    className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#1B5E20] data-[state=active]:shadow-sm"
                  >
                    Aplicação e EPI
                  </TabsTrigger>
                </TabsList>

                {/* ABA 1: CHECKLIST DE DETECÇÃO */}
                <TabsContent value="checklist" className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Registro MAPA */}
                    <div className="p-3 bg-white border border-[#DCE5DC] rounded-xl flex items-start gap-3">
                      {cl?.registro_mapa.encontrado ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold text-xs text-[#1C2B1C] block">
                          Registro MAPA
                        </span>
                        <span className="text-xs text-[#5A6D5A]">{cl?.registro_mapa.valor}</span>
                      </div>
                    </div>

                    {/* Nome Comercial */}
                    <div className="p-3 bg-white border border-[#DCE5DC] rounded-xl flex items-start gap-3">
                      {cl?.nome_comercial.encontrado ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold text-xs text-[#1C2B1C] block">
                          Nome Comercial
                        </span>
                        <span className="text-xs text-[#5A6D5A]">{cl?.nome_comercial.valor}</span>
                      </div>
                    </div>

                    {/* Composição */}
                    <div className="p-3 bg-white border border-[#DCE5DC] rounded-xl flex items-start gap-3">
                      {cl?.composicao.encontrado ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold text-xs text-[#1C2B1C] block">
                          Composição ({cl?.composicao.total} ingredientes detectados)
                        </span>
                        <span className="text-xs text-[#5A6D5A]">
                          Separados em Ingrediente Ativo e outros ingredientes.
                        </span>
                      </div>
                    </div>

                    {/* Cadeia de Empresas */}
                    <div className="p-3 bg-white border border-[#DCE5DC] rounded-xl flex items-start gap-3">
                      {cl?.empresas.encontrado ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold text-xs text-[#1C2B1C] block">
                          Cadeia de Empresas ({cl?.empresas.total} cadastradas)
                        </span>
                        <span className="text-xs text-[#5A6D5A]">
                          Titular: {cl?.empresas.titular} ({cl?.empresas.fabricantes} fabr.,{' '}
                          {cl?.empresas.formuladores} form.)
                        </span>
                      </div>
                    </div>

                    {/* Toxicologia e Meio Ambiente */}
                    <div className="p-3 bg-white border border-[#DCE5DC] rounded-xl flex items-start gap-3">
                      {cl?.classificacoes.encontrado ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold text-xs text-[#1C2B1C] block">
                          Classificação Toxicológica e Ambiental
                        </span>
                        <span className="text-xs text-[#5A6D5A]">
                          {cl?.classificacoes.toxicologica} | {cl?.classificacoes.ambiental}
                        </span>
                      </div>
                    </div>

                    {/* Quadros de Recomendação (Culturas e Alvos) */}
                    <div className="p-3 bg-white border border-[#DCE5DC] rounded-xl flex items-start gap-3">
                      {cl?.culturas.encontrado ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold text-xs text-[#1C2B1C] block">
                          Quadros de Uso ({cl?.culturas.total} culturas, {cl?.alvos.total}{' '}
                          alvos/pragas)
                        </span>
                        <span className="text-xs text-[#5A6D5A]">
                          Doses recomendadas em L/ha e intervalos de segurança em dias.
                        </span>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ABA 2: PRODUTO PRINCIPAL */}
                <TabsContent value="produto" className="mt-3">
                  <div className="bg-white border border-[#DCE5DC] rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <span className="text-[#5A6D5A] block text-[11px]">Registro MAPA</span>
                        <strong className="text-xs font-mono">
                          {dados?.produto.registro_mapa}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#5A6D5A] block text-[11px]">Nome Comercial</span>
                        <strong className="text-xs">{dados?.produto.nome_comercial}</strong>
                      </div>
                      <div>
                        <span className="text-[#5A6D5A] block text-[11px]">Princípio Ativo</span>
                        <strong className="text-xs">{dados?.produto.principio_ativo}</strong>
                      </div>
                      <div>
                        <span className="text-[#5A6D5A] block text-[11px]">Classe Agronômica</span>
                        <span className="text-xs">{dados?.produto.classe_agronomica}</span>
                      </div>
                      <div>
                        <span className="text-[#5A6D5A] block text-[11px]">Grupo Químico</span>
                        <span className="text-xs">{dados?.produto.grupo_quimico}</span>
                      </div>
                      <div>
                        <span className="text-[#5A6D5A] block text-[11px]">Tipo de Formulação</span>
                        <span className="text-xs">{dados?.produto.tipo_formulacao}</span>
                      </div>
                      <div>
                        <span className="text-[#5A6D5A] block text-[11px]">
                          Classificação Toxicológica
                        </span>
                        <span className="text-xs">{dados?.produto.classificacao_toxicologica}</span>
                      </div>
                      <div>
                        <span className="text-[#5A6D5A] block text-[11px]">
                          Potencial Ambiental
                        </span>
                        <span className="text-xs">{dados?.produto.classificacao_ambiental}</span>
                      </div>
                      <div>
                        <span className="text-[#5A6D5A] block text-[11px]">NCM Sugerida</span>
                        <span className="text-xs font-mono">{dados?.produto.ncm_padrao}</span>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ABA 3: COMPOSIÇÃO */}
                <TabsContent value="composicao" className="mt-3">
                  <div className="bg-white border border-[#DCE5DC] rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-[#5A6D5A]">
                        <tr>
                          <th className="py-2.5 px-3">Ingrediente</th>
                          <th className="py-2.5 px-3">Função</th>
                          <th className="py-2.5 px-3">Concentração</th>
                          <th className="py-2.5 px-3">% (m/v)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0F4F0]">
                        {dados?.composicao.map((comp, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="py-2 px-3 font-medium text-[#1C2B1C]">
                              {comp.ingrediente_ativo}
                            </td>
                            <td className="py-2 px-3">
                              <Badge variant="outline" className="text-[10px]">
                                {comp.funcao_ingrediente}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 font-mono">
                              {comp.concentracao} {comp.unidade_medida}
                            </td>
                            <td className="py-2 px-3">{comp.percentual_volume || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* ABA 4: EMPRESAS */}
                <TabsContent value="empresas" className="mt-3">
                  <div className="bg-white border border-[#DCE5DC] rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-[#5A6D5A]">
                        <tr>
                          <th className="py-2.5 px-3">Tipo Relação</th>
                          <th className="py-2.5 px-3">Razão Social</th>
                          <th className="py-2.5 px-3">CNPJ</th>
                          <th className="py-2.5 px-3">Localização</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0F4F0]">
                        {dados?.empresas.map((emp, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="py-2 px-3">
                              <Badge variant="outline" className="text-[10px]">
                                {emp.tipo_relacao}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 font-medium text-[#1C2B1C]">
                              {emp.razao_social}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px]">{emp.cnpj || '—'}</td>
                            <td className="py-2 px-3 text-[#5A6D5A]">
                              {emp.municipio ? `${emp.municipio}/${emp.uf}` : emp.pais || 'Brasil'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* ABA 5: CULTURAS E ALVOS */}
                <TabsContent value="quadros" className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Culturas */}
                    <div className="bg-white border border-[#DCE5DC] rounded-xl p-3 space-y-2">
                      <span className="font-bold text-xs text-[#1C2B1C] block">
                        Culturas Autorizadas e Carência ({dados?.culturas.length || 0})
                      </span>
                      <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                        {dados?.culturas.map((c, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-2 bg-[#F5F7F1] rounded-lg"
                          >
                            <span className="font-medium text-[#1C2B1C]">{c.cultura}</span>
                            <span className="text-[11px] text-[#5A6D5A]">
                              Carência: <strong>{c.intervalo_seguranca_dias} dias</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Alvos */}
                    <div className="bg-white border border-[#DCE5DC] rounded-xl p-3 space-y-2">
                      <span className="font-bold text-xs text-[#1C2B1C] block">
                        Plantas Daninhas / Alvos Biológicos ({dados?.alvos.length || 0})
                      </span>
                      <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                        {dados?.alvos.map((a, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-2 bg-[#F5F7F1] rounded-lg"
                          >
                            <div>
                              <span className="font-medium text-[#1C2B1C] block">
                                {a.alvo_biologico}
                              </span>
                              <span className="italic text-[10px] text-[#5A6D5A]">
                                {a.nome_cientifico}
                              </span>
                            </div>
                            <span className="text-[11px] text-[#5A6D5A] font-mono">
                              {a.dose_minima} - {a.dose_maxima} {a.unidade_dose}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ABA 6: APLICAÇÃO E EPI */}
                <TabsContent value="aplicacao" className="mt-3">
                  <div className="bg-white border border-[#DCE5DC] rounded-xl p-4 space-y-2.5">
                    {dados?.aplicacao.map((apl, i) => (
                      <div key={i} className="space-y-2 text-xs">
                        <div>
                          <span className="text-[#5A6D5A] block text-[11px]">
                            Equipamento e Volume de Calda:
                          </span>
                          <span className="font-medium">
                            {apl.equipamento_recomendado} ({apl.volume_calda_aplicacao})
                          </span>
                        </div>
                        <div>
                          <span className="text-[#5A6D5A] block text-[11px]">
                            Condições Meteorológicas:
                          </span>
                          <span>{apl.condicoes_meteorologicas}</span>
                        </div>
                        <div>
                          <span className="text-[#5A6D5A] block text-[11px]">
                            EPI Preparo da Calda:
                          </span>
                          <span className="text-[#5A6D5A]">{apl.epi_preparo_calda}</span>
                        </div>
                        <div>
                          <span className="text-[#5A6D5A] block text-[11px]">EPI Aplicação:</span>
                          <span className="text-[#5A6D5A]">{apl.epi_aplicacao}</span>
                        </div>
                        <div>
                          <span className="text-[#5A6D5A] block text-[11px]">
                            Primeiros Socorros:
                          </span>
                          <span className="text-[#5A6D5A]">{apl.medidas_primeiros_socorros}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>

        {/* RODAPÉ DO MODAL */}
        <DialogFooter className="p-3 bg-[#F5F7F1] border-t border-[#DCE5DC] flex-shrink-0 flex items-center justify-between sm:justify-between">
          <div className="text-[11px] text-[#5A6D5A] hidden sm:block">
            {resultadoAnalise ? (
              <span>
                Os dados detectados serão gravados no cadastro principal e blocos com idempotência.
              </span>
            ) : (
              <span>Aceita PDF de bula oficial brasileira de agrotóxicos do MAPA.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={analisando || gravando}
              className="rounded-xl border-[#DCE5DC] text-xs"
            >
              Fechar
            </Button>
            {resultadoAnalise && !resultadoGravacao && (
              <Button
                size="sm"
                onClick={handleGravarTudo}
                disabled={gravando}
                className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white rounded-xl text-xs flex items-center gap-1.5"
              >
                {gravando ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Gravando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Gravar Cadastro da Bula</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
