import React, { useEffect, useState } from 'react'
import { Percent, Plus, Search, Save, Loader2, HelpCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollableTable } from '@/components/ScrollableTable'
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
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { listarParametrizacaoFiscal, salvarParametrizacaoFiscal } from '@/services/agroService'
import type { ParametrizacaoFiscal } from '@/types/agro'

export function Parametrizacao() {
  const { isAdmin } = useAuth()
  const [parametros, setParametros] = useState<ParametrizacaoFiscal[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  // Novo NCM inline
  const [novoNcm, setNovoNcm] = useState('')
  const [novoPis, setNovoPis] = useState<number>(1.65)
  const [novoCofins, setNovoCofins] = useState<number>(7.6)
  const [novoRegime, setNovoRegime] = useState<'cumulativo' | 'nao_cumulativo'>('nao_cumulativo')
  const [novoIbs, setNovoIbs] = useState<number>(0.1)
  const [novoCbs, setNovoCbs] = useState<number>(0.9)
  const [novoClassif, setNovoClassif] = useState('Bens e Serviços Agropecuários')
  const [novoTrib, setNovoTrib] = useState('Tributação Reduzida (60%)')
  const [addingNovo, setAddingNovo] = useState(false)

  const carregarParametros = async () => {
    setLoading(true)
    try {
      let filter = ''
      if (search.trim()) {
        const clean = search.trim().replace(/'/g, "\\'")
        filter = `ncm ~ '${clean}' || classificacao ~ '${clean}'`
      }
      const res = await listarParametrizacaoFiscal({ perPage: 50, filter })
      setParametros(res.items)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarParametros()
  }, [search])

  const handleUpdateItemField = (id: string, field: keyof ParametrizacaoFiscal, value: any) => {
    setParametros((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    )
  }

  const handleSalvarLinha = async (item: ParametrizacaoFiscal) => {
    setSavingId(item.id)
    try {
      await salvarParametrizacaoFiscal({
        id: item.id,
        ncm: item.ncm,
        aliquota_pis: Number(item.aliquota_pis),
        aliquota_cofins: Number(item.aliquota_cofins),
        regime: item.regime,
        aliquota_ibs: Number(item.aliquota_ibs),
        aliquota_cbs: Number(item.aliquota_cbs),
        classificacao: item.classificacao,
        tributacao: item.tributacao,
      })
      toast({
        title: 'Parâmetros Salvos',
        description: `Tributação do NCM ${item.ncm} atualizada com sucesso.`,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar parametrização.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    } finally {
      setSavingId(null)
    }
  }

  const handleCadastrarNovo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoNcm.trim()) return
    setAddingNovo(true)

    try {
      await salvarParametrizacaoFiscal({
        ncm: novoNcm.replace(/\D/g, ''),
        aliquota_pis: novoPis,
        aliquota_cofins: novoCofins,
        regime: novoRegime,
        aliquota_ibs: novoIbs,
        aliquota_cbs: novoCbs,
        classificacao: novoClassif,
        tributacao: novoTrib,
      })
      toast({
        title: 'NCM Parametrizado',
        description: `Regras fiscais para NCM ${novoNcm} incluídas com sucesso.`,
      })
      setNovoNcm('')
      carregarParametros()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar parametrização.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    } finally {
      setAddingNovo(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in-up duration-300">
      {/* Top Header */}
      <div>
        <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
          <Percent className="w-6 h-6 text-[#1B5E20]" />
          <span>Parametrização Fiscal & Tributária (PIS/COFINS e IBS/CBS)</span>
        </h2>
        <p className="text-xs text-[#5A6D5A] mt-0.5">
          Configuração de alíquotas por código NCM para cálculo automático de carga tributária e
          enquadramento da Reforma Tributária.
        </p>
      </div>

      {/* Card de Adicionar Novo NCM Tributário (Apenas Admin) */}
      {isAdmin && (
        <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-4 h-4 text-[#1B5E20]" />
            <h3 className="text-xs font-bold text-[#1C2B1C] uppercase tracking-wider">
              Cadastrar Parâmetros Tributários por NCM
            </h3>
          </div>
          <form onSubmit={handleCadastrarNovo} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">NCM (8 dígitos) *</Label>
                <Input
                  required
                  maxLength={10}
                  value={novoNcm}
                  onChange={(e) => setNovoNcm(e.target.value)}
                  placeholder="Ex.: 38089324"
                  className="h-9 text-xs font-mono font-bold text-[#1B5E20] border-[#DCE5DC]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Alíquota PIS (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={novoPis}
                  onChange={(e) => setNovoPis(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Alíquota COFINS (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={novoCofins}
                  onChange={(e) => setNovoCofins(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Regime PIS/COFINS</Label>
                <Select
                  value={novoRegime}
                  onValueChange={(val: 'cumulativo' | 'nao_cumulativo') => setNovoRegime(val)}
                >
                  <SelectTrigger className="h-9 text-xs border-[#DCE5DC]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao_cumulativo">Não Cumulativo</SelectItem>
                    <SelectItem value="cumulativo">Cumulativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Alíquota IBS (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={novoIbs}
                  onChange={(e) => setNovoIbs(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Alíquota CBS (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={novoCbs}
                  onChange={(e) => setNovoCbs(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Classificação</Label>
                <Input
                  value={novoClassif}
                  onChange={(e) => setNovoClassif(e.target.value)}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Tributação</Label>
                <Input
                  value={novoTrib}
                  onChange={(e) => setNovoTrib(e.target.value)}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                disabled={addingNovo}
                className="text-xs h-9 bg-[#1B5E20] hover:bg-[#2E7D32] text-white px-5"
              >
                {addingNovo ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : (
                  <Plus className="w-3.5 h-3.5 mr-1" />
                )}
                Adicionar Parâmetro NCM
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Busca e Tabela Editável Inline */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6D5A]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por código NCM..."
            className="pl-9 text-xs h-10 border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
          />
        </div>
      </Card>

      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden">
        <ScrollableTable>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                <th className="py-3 px-3 font-semibold">NCM</th>
                <th className="py-3 px-3 font-semibold">PIS (%)</th>
                <th className="py-3 px-3 font-semibold">COFINS (%)</th>
                <th className="py-3 px-3 font-semibold">Regime</th>
                <th className="py-3 px-3 font-semibold">IBS (%)</th>
                <th className="py-3 px-3 font-semibold">CBS (%)</th>
                <th className="py-3 px-3 font-semibold">Classificação / Tributação</th>
                <th className="py-3 px-3 font-semibold text-right">Salvar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Carregando tabela fiscal...
                  </td>
                </tr>
              ) : parametros.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-[#5A6D5A]">
                    Nenhum parâmetro fiscal cadastrado ainda. Use o formulário acima para cadastrar.
                  </td>
                </tr>
              ) : (
                parametros.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F5F7F1]/50 transition-colors">
                    <td className="py-2 px-3 font-mono font-bold text-[#1B5E20] whitespace-nowrap">
                      {item.ncm}
                    </td>
                    <td className="py-2 px-3 w-20">
                      <Input
                        type="number"
                        step="0.01"
                        value={item.aliquota_pis}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            'aliquota_pis',
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-xs px-2 border-[#DCE5DC]"
                      />
                    </td>
                    <td className="py-2 px-3 w-20">
                      <Input
                        type="number"
                        step="0.01"
                        value={item.aliquota_cofins}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            'aliquota_cofins',
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-xs px-2 border-[#DCE5DC]"
                      />
                    </td>
                    <td className="py-2 px-3 w-36">
                      <Select
                        value={item.regime}
                        onValueChange={(val: 'cumulativo' | 'nao_cumulativo') =>
                          handleUpdateItemField(item.id, 'regime', val)
                        }
                      >
                        <SelectTrigger className="h-8 text-xs border-[#DCE5DC]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nao_cumulativo">Não Cumulativo</SelectItem>
                          <SelectItem value="cumulativo">Cumulativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-3 w-20">
                      <Input
                        type="number"
                        step="0.01"
                        value={item.aliquota_ibs}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            'aliquota_ibs',
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-xs px-2 border-[#DCE5DC]"
                      />
                    </td>
                    <td className="py-2 px-3 w-20">
                      <Input
                        type="number"
                        step="0.01"
                        value={item.aliquota_cbs}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            'aliquota_cbs',
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-xs px-2 border-[#DCE5DC]"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-[#1C2B1C] block truncate max-w-[200px]">
                        {item.classificacao}
                      </span>
                      <span className="text-[10px] text-[#5A6D5A] block truncate max-w-[200px]">
                        {item.tributacao}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {isAdmin ? (
                        <Button
                          size="sm"
                          onClick={() => handleSalvarLinha(item)}
                          disabled={savingId === item.id}
                          className="h-8 text-xs bg-[#1B5E20] hover:bg-[#2E7D32] text-white"
                        >
                          {savingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic px-2">Leitura</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollableTable>
      </Card>

      {/* Explicação da Reforma Tributária Agro */}
      <Card className="rounded-2xl border-emerald-200 bg-emerald-50/50 p-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-[#1B5E20] flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[#1C2B1C] space-y-1">
            <h4 className="font-bold">Regime Especial do Agronegócio (IBS/CBS e PIS/COFINS)</h4>
            <p className="text-[#5A6D5A] leading-relaxed">
              Insumos agropecuários, fertilizantes, defensivos agrícolas e sementes contam com
              redução de 60% nas alíquotas de IBS e CBS ou isenção conforme lista regulamentar da
              Reforma Tributária (Emenda Constitucional 132). Ao parametrizar o NCM, as validações
              individuais calculam a carga efetiva correspondente.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
