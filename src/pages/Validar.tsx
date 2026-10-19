import React, { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Save,
  RotateCcw,
  Sparkles,
  Info,
  Check,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { toast } from '@/hooks/use-toast'
import { validarProdutoServidor, criarProdutoBaseMestre } from '@/services/agroService'
import type { ProdutoInput, RelatorioValidacao } from '@/types/agro'

const EMBALAGENS_OPCOES = [
  'Frasco',
  'Bombona',
  'Tambor',
  'Saco',
  'Sacaria',
  'Bisnaga',
  'Pote',
  'Balde',
  'Container',
  'Big Bag',
  'Granel',
]

export default function Validar() {
  const [formData, setFormData] = useState<ProdutoInput>({
    nome_produto: '',
    ncm: '',
    embalagem: '',
    principio_ativo: '',
    fabricante: '',
    registro_mapa: '',
    concentracao: 0,
    unidade_concentracao: 'g/L',
  })

  const [loading, setLoading] = useState(false)
  const [savingBaseMestre, setSavingBaseMestre] = useState(false)
  const [relatorio, setRelatorio] = useState<RelatorioValidacao | null>(null)
  const [salvoComSucesso, setSalvoComSucesso] = useState(false)

  const handleChange = (field: keyof ProdutoInput, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleValidar = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setSalvoComSucesso(false)

    try {
      const resp = await validarProdutoServidor(formData)
      setRelatorio(resp)
      if (resp.status === 'APROVADO') {
        toast({
          title: 'Produto Aprovado!',
          description: 'Todas as 6 travas de auditoria foram satisfeitas com sucesso.',
        })
      } else {
        toast({
          variant: 'destructive',
          title: 'Produto Reprovado',
          description: 'Uma ou mais travas de auditoria impediram a aprovação do cadastro.',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao conectar com o motor de validação.'
      toast({
        variant: 'destructive',
        title: 'Erro de Execução',
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSalvarBaseMestre = async () => {
    if (!relatorio || relatorio.status !== 'APROVADO') return
    setSavingBaseMestre(true)
    try {
      await criarProdutoBaseMestre({
        nome_produto: formData.nome_produto,
        ncm: formData.ncm.replace(/\D/g, ''),
        embalagem: formData.embalagem,
        principio_ativo: formData.principio_ativo,
        fabricante: formData.fabricante,
        registro_mapa: formData.registro_mapa,
        concentracao: Number(formData.concentracao),
        unidade_concentracao: formData.unidade_concentracao,
        status_validacao: 'aprovado',
      })
      setSalvoComSucesso(true)
      toast({
        title: 'Salvo com Sucesso!',
        description: 'O produto foi cadastrado e homologado na Base Mestre.',
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar produto.'
      toast({
        variant: 'destructive',
        title: 'Falha ao Salvar',
        description: msg,
      })
    } finally {
      setSavingBaseMestre(false)
    }
  }

  const handleLimpar = () => {
    setFormData({
      nome_produto: '',
      ncm: '',
      embalagem: '',
      principio_ativo: '',
      fabricante: '',
      registro_mapa: '',
      concentracao: 0,
      unidade_concentracao: 'g/L',
    })
    setRelatorio(null)
    setSalvoComSucesso(false)
  }

  // Preenchimento de exemplo para demonstração
  const handlePreencherExemplo = () => {
    setFormData({
      nome_produto: 'GLIFOSATO 480 SL PREMIUM',
      ncm: '38089324',
      embalagem: 'Bombona',
      principio_ativo: 'Glifosato',
      fabricante: 'AgroQuímica do Brasil S/A',
      registro_mapa: '00123/21',
      concentracao: 480,
      unidade_concentracao: 'g/L',
    })
  }

  return (
    <div className="space-y-6 animate-in fade-in-up duration-300">
      {/* Header da Tela */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
            <span>Validação de Cadastro de Produtos</span>
            <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs">
              Motor de 6 Travas
            </Badge>
          </h2>
          <p className="text-xs text-[#5A6D5A] mt-0.5">
            Preencha os dados técnicos do produto para submissão à auditoria em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreencherExemplo}
            className="text-xs h-8 text-[#1B5E20] border-emerald-300 hover:bg-emerald-50"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 text-[#F57F17]" />
            Carregar Exemplo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLimpar}
            className="text-xs h-8 text-[#5A6D5A] hover:text-[#1C2B1C]"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Limpar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ------------------------------------------------------------------ */}
        {/* COLUNA ESQUERDA: FORMULÁRIO DO PRODUTO (5 colunas) */}
        {/* ------------------------------------------------------------------ */}
        <div className="lg:col-span-5">
          <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm sticky top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-[#1C2B1C]">
                Ficha Cadastral do Produto
              </CardTitle>
              <CardDescription className="text-xs text-[#5A6D5A]">
                Campos obrigatórios para homologação junto aos órgãos fiscalizadores
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleValidar} className="space-y-3.5">
                {/* Nome do Produto */}
                <div className="space-y-1">
                  <Label htmlFor="nome_produto" className="text-xs font-semibold text-[#1C2B1C]">
                    Nome Comercial do Produto *
                  </Label>
                  <Input
                    id="nome_produto"
                    required
                    value={formData.nome_produto}
                    onChange={(e) => handleChange('nome_produto', e.target.value)}
                    placeholder="Ex.: HERBICIDA TOTAL MAX"
                    className="h-9 text-xs border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
                  />
                </div>

                {/* NCM */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ncm" className="text-xs font-semibold text-[#1C2B1C]">
                      Código NCM (8 dígitos) *
                    </Label>
                    <span className="text-[10px] text-[#5A6D5A]">TIPI Brasil</span>
                  </div>
                  <Input
                    id="ncm"
                    required
                    maxLength={10}
                    value={formData.ncm}
                    onChange={(e) => handleChange('ncm', e.target.value)}
                    placeholder="Ex.: 38089324"
                    className="h-9 text-xs font-mono border-[#DCE5DC] text-[#1B5E20] font-bold focus-visible:ring-[#1B5E20]"
                  />
                </div>

                {/* Embalagem */}
                <div className="space-y-1">
                  <Label htmlFor="embalagem" className="text-xs font-semibold text-[#1C2B1C]">
                    Tipo de Embalagem *
                  </Label>
                  <Select
                    value={formData.embalagem}
                    onValueChange={(val) => handleChange('embalagem', val)}
                  >
                    <SelectTrigger className="h-9 text-xs border-[#DCE5DC]">
                      <SelectValue placeholder="Selecione a embalagem..." />
                    </SelectTrigger>
                    <SelectContent>
                      {EMBALAGENS_OPCOES.map((emb) => (
                        <SelectItem key={emb} value={emb} className="text-xs">
                          {emb}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Princípio Ativo */}
                <div className="space-y-1">
                  <Label htmlFor="pa" className="text-xs font-semibold text-[#1C2B1C]">
                    Princípio Ativo (Ingrediente Ativo) *
                  </Label>
                  <Input
                    id="pa"
                    required
                    value={formData.principio_ativo}
                    onChange={(e) => handleChange('principio_ativo', e.target.value)}
                    placeholder="Ex.: Glifosato, Atrazina, Mancozebe..."
                    className="h-9 text-xs border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
                  />
                </div>

                {/* Fabricante */}
                <div className="space-y-1">
                  <Label htmlFor="fabricante" className="text-xs font-semibold text-[#1C2B1C]">
                    Fabricante / Titular do Registro *
                  </Label>
                  <Input
                    id="fabricante"
                    required
                    value={formData.fabricante}
                    onChange={(e) => handleChange('fabricante', e.target.value)}
                    placeholder="Ex.: Syngenta, Bayer, UPL, Basf..."
                    className="h-9 text-xs border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
                  />
                </div>

                {/* Registro MAPA */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="mapa" className="text-xs font-semibold text-[#1C2B1C]">
                      Registro MAPA *
                    </Label>
                    <span className="text-[10px] text-[#5A6D5A]">Ex: 00123/21</span>
                  </div>
                  <Input
                    id="mapa"
                    required
                    value={formData.registro_mapa}
                    onChange={(e) => handleChange('registro_mapa', e.target.value)}
                    placeholder="Ex.: 00123/21 ou 1234-9"
                    className="h-9 text-xs border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
                  />
                </div>

                {/* Concentração e Unidade */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="concentracao" className="text-xs font-semibold text-[#1C2B1C]">
                      Concentração *
                    </Label>
                    <Input
                      id="concentracao"
                      type="number"
                      step="any"
                      required
                      value={formData.concentracao || ''}
                      onChange={(e) =>
                        handleChange('concentracao', parseFloat(e.target.value) || 0)
                      }
                      placeholder="Ex.: 480"
                      className="h-9 text-xs border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="unidade" className="text-xs font-semibold text-[#1C2B1C]">
                      Unidade
                    </Label>
                    <Select
                      value={formData.unidade_concentracao}
                      onValueChange={(val) => handleChange('unidade_concentracao', val)}
                    >
                      <SelectTrigger className="h-9 text-xs border-[#DCE5DC]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="g/L">g/L</SelectItem>
                        <SelectItem value="g/kg">g/kg</SelectItem>
                        <SelectItem value="%">%</SelectItem>
                        <SelectItem value="mL/L">mL/L</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Botão Submeter */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-[#1B5E20] hover:bg-[#2E7D32] text-white font-semibold rounded-xl mt-4 flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processando 6 Travas no Servidor...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Executar Auditoria Cadastral</span>
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* COLUNA DIREITA: RELATÓRIO DO MOTOR DE TRAVAS (7 colunas) */}
        {/* ------------------------------------------------------------------ */}
        <div className="lg:col-span-7 space-y-4">
          {!relatorio ? (
            <div className="bg-white rounded-2xl border border-dashed border-[#DCE5DC] p-12 text-center flex flex-col items-center justify-center min-h-[460px]">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#1B5E20] flex items-center justify-center mb-3">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-base text-[#1C2B1C]">Aguardando Submissão</h3>
              <p className="text-xs text-[#5A6D5A] max-w-sm mt-1">
                Preencha os campos ao lado e clique em "Executar Auditoria Cadastral" para testar as
                6 travas regulamentares e apurar alíquotas fiscais.
              </p>
            </div>
          ) : (
            <>
              {/* Card de Veredito Geral */}
              <Card
                className={`rounded-2xl border transition-all duration-300 shadow-md ${
                  relatorio.status === 'APROVADO'
                    ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/80 to-white'
                    : 'border-red-300 bg-gradient-to-br from-red-50/80 to-white'
                }`}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md animate-in zoom-in-75 duration-300 ${
                          relatorio.status === 'APROVADO' ? 'bg-[#2E7D32]' : 'bg-[#C62828]'
                        }`}
                      >
                        {relatorio.status === 'APROVADO' ? (
                          <CheckCircle2 className="w-8 h-8" />
                        ) : (
                          <XCircle className="w-8 h-8" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#5A6D5A]">
                            Veredito da Auditoria
                          </span>
                          <Badge
                            className={`font-bold text-xs ${
                              relatorio.status === 'APROVADO'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-red-600 text-white'
                            }`}
                          >
                            {relatorio.status}
                          </Badge>
                        </div>
                        <h3 className="text-xl font-bold text-[#1C2B1C] mt-0.5">
                          Conformidade Cadastral: {relatorio.score}%
                        </h3>
                        <p className="text-xs text-[#5A6D5A]">
                          {relatorio.total_aprovadas} de {relatorio.total_travas} travas
                          regulamentares aprovadas
                        </p>
                      </div>
                    </div>

                    {/* Botão de Salvar na Base Mestre */}
                    {relatorio.status === 'APROVADO' && (
                      <div>
                        {salvoComSucesso ? (
                          <Badge className="bg-emerald-700 text-white px-3 py-2 text-xs flex items-center gap-1.5 shadow-sm">
                            <Check className="w-4 h-4" />
                            Cadastrado na Base Mestre
                          </Badge>
                        ) : (
                          <Button
                            onClick={handleSalvarBaseMestre}
                            disabled={savingBaseMestre}
                            className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white rounded-xl shadow-md flex items-center gap-2 text-xs font-semibold h-10 px-4"
                          >
                            {savingBaseMestre ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                            Salvar na Base Mestre
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Barra de Progresso do Score */}
                  <div className="mt-4">
                    <Progress
                      value={relatorio.score}
                      className={`h-2.5 rounded-full ${
                        relatorio.status === 'APROVADO'
                          ? '[&>div]:bg-[#2E7D32]'
                          : '[&>div]:bg-[#C62828]'
                      }`}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Parametrização Fiscal Encontrada */}
              {relatorio.parametrizacao_fiscal && (
                <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-[#1B5E20]" />
                    <h4 className="text-xs font-bold text-[#1C2B1C] uppercase tracking-wider">
                      Alíquotas Tributárias Calculadas (NCM {relatorio.parametrizacao_fiscal.ncm})
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC]">
                      <span className="text-[#5A6D5A] block text-[10px]">PIS</span>
                      <strong className="text-sm text-[#1C2B1C]">
                        {relatorio.parametrizacao_fiscal.aliquota_pis ?? 0}%
                      </strong>
                    </div>
                    <div className="p-2.5 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC]">
                      <span className="text-[#5A6D5A] block text-[10px]">COFINS</span>
                      <strong className="text-sm text-[#1C2B1C]">
                        {relatorio.parametrizacao_fiscal.aliquota_cofins ?? 0}%
                      </strong>
                    </div>
                    <div className="p-2.5 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC]">
                      <span className="text-[#5A6D5A] block text-[10px]">IBS</span>
                      <strong className="text-sm text-[#1C2B1C]">
                        {relatorio.parametrizacao_fiscal.aliquota_ibs ?? 0}%
                      </strong>
                    </div>
                    <div className="p-2.5 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC]">
                      <span className="text-[#5A6D5A] block text-[10px]">CBS</span>
                      <strong className="text-sm text-[#1C2B1C]">
                        {relatorio.parametrizacao_fiscal.aliquota_cbs ?? 0}%
                      </strong>
                    </div>
                  </div>
                </Card>
              )}

              {/* Lista dos 6 Cards de Travas com Efeito Pop-Scale & Glow */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-[#5A6D5A] uppercase tracking-wider px-1">
                  Detalhamento Individual das 6 Travas de Auditoria
                </h4>
                {relatorio.travas.map((trava, idx) => {
                  const isAprovado = trava.aprovado
                  return (
                    <div
                      key={trava.id_trava}
                      style={{ animationDelay: `${idx * 50}ms` }}
                      className={`p-4 rounded-xl border transition-all duration-200 animate-in fade-in-up flex items-start gap-3.5 bg-white shadow-sm ${
                        isAprovado
                          ? 'border-emerald-200 hover:border-emerald-300 hover:shadow-emerald-100/50 hover:shadow-md'
                          : 'border-red-200 hover:border-red-300 hover:shadow-red-100/50 hover:shadow-md'
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform transform active:scale-95 ${
                          isAprovado ? 'bg-emerald-100 text-[#2E7D32]' : 'bg-red-100 text-[#C62828]'
                        }`}
                      >
                        {isAprovado ? (
                          <CheckCircle2 className="w-5 h-5 animate-in zoom-in-75 duration-200" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 animate-in zoom-in-75 duration-200" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="text-xs font-bold text-[#1C2B1C]">
                            Trava {trava.id_trava}: {trava.trava_nome}
                          </h5>
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase font-bold border-0 ${
                              isAprovado
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {isAprovado ? 'Conforme' : 'Bloqueio'}
                          </Badge>
                        </div>
                        <p className="text-xs text-[#5A6D5A] mt-1 leading-relaxed">
                          {trava.mensagem}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
