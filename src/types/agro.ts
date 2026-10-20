import type { RecordModel } from 'pocketbase'

export interface RegraNcmEmbalagem extends RecordModel {
  ncm: string
  descricao: string
  embalagens_permitidas: string[]
  regra_especial?: string
  created: string
  updated: string
}

export interface DicionarioPrincipioAtivo extends RecordModel {
  principio_ativo: string
  classe: string
  grupo_quimico: string
  concentracao_min: number
  concentracao_max: number
  unidade: string
  status: string
  created: string
  updated: string
}

export type StatusValidacao = 'aprovado' | 'reprovado' | 'pendente'

export interface BaseMestreProduto extends RecordModel {
  nome_produto: string
  ncm: string
  embalagem: string
  principio_ativo: string
  fabricante: string
  registro_mapa: string
  concentracao: number
  unidade_concentracao?: string
  status_validacao: StatusValidacao
  data_inclusao: string
  created: string
  updated: string
}

export interface ParametrizacaoFiscal extends RecordModel {
  ncm: string
  aliquota_pis: number
  aliquota_cofins: number
  regime: 'cumulativo' | 'nao_cumulativo'
  aliquota_ibs: number
  aliquota_cbs: number
  classificacao: string
  tributacao: string
  created: string
  updated: string
}

export interface LogValidacao extends RecordModel {
  nome_produto: string
  ncm: string
  embalagem: string
  principio_ativo: string
  id_trava: number
  trava_nome: string
  aprovado: boolean
  mensagem: string
  data_validacao: string
  created: string
  updated: string
}

export interface TravaResultado {
  id_trava: number
  trava_nome: string
  aprovado: boolean
  mensagem: string
}

export interface FonteConsultada {
  fonte: string
  tipo: 'mapa' | 'bula' | 'ncm' | 'outros'
  status: 'sucesso' | 'nao_encontrado' | 'divergencia' | 'indisponivel'
  url?: string
  detalhes: string
}

export interface BaseMestreInclusaoResultado {
  incluido: boolean
  motivo: string
  id_registro?: string | null
}

export interface ProdutoValidadoConsolidado {
  nome_produto: string
  ncm: string
  ncm_descricao_oficial?: string
  embalagem: string
  quantidade_embalagem?: string
  principio_ativo: string
  fabricante: string
  registro_mapa: string
  concentracao: number
  unidade_concentracao?: string
  classe_uso?: string
  formulacao?: string
  culturas?: string[]
  bula_resumo?: string
}

export interface RelatorioValidacao {
  status: 'APROVADO' | 'REPROVADO'
  score: number
  total_travas: number
  total_aprovadas: number
  travas: TravaResultado[]
  parametrizacao_fiscal: Partial<ParametrizacaoFiscal> | null
  fontes_consultadas?: FonteConsultada[]
  avisos_divergencia?: string[]
  base_mestre_inclusao?: BaseMestreInclusaoResultado
  produto_validado: ProdutoValidadoConsolidado
}

export interface ProdutoInput {
  nome_produto: string
  ncm: string
  embalagem: string
  quantidade_embalagem?: string
  unidade_embalagem?: string
  principio_ativo: string
  fabricante: string
  registro_mapa: string
  concentracao: number
  unidade_concentracao?: string
  auto_cadastrar?: boolean
}

export interface GrupoDuplicidade {
  id: string
  criterio: string
  criterio_tipo: 'ncm_pa' | 'registro_mapa' | 'nome_ncm'
  chave: string
  total_ocorrencias: number
  registros: BaseMestreProduto[]
}

export interface RelatorioDuplicidades {
  total_grupos: number
  total_produtos_duplicados: number
  grupos: GrupoDuplicidade[]
}

// -----------------------------------------------------------------------------
// Sincronização de Produtos Oficiais (MAPA / AGROFIT / SIPEAGRO)
// -----------------------------------------------------------------------------
export type OrigemFonteSincronizacao = 'AGROFIT_FORMULADO' | 'AGROFIT_TECNICO' | 'SIPEAGRO'

export type DesfechoIntegracao = 'IMPORTADO' | 'JA_EXISTENTE' | 'ATUALIZADO' | 'DESCARTADO'

export interface ItemRelatorioIntegracao {
  fonte: OrigemFonteSincronizacao | string
  fonte_nome: string
  registro_mapa: string
  marca: string
  titular: string
  principio_ativo: string
  ncm: string
  desfecho: DesfechoIntegracao
  motivo: string
}

export interface ContadoresDesfecho {
  geral: {
    total: number
    importado: number
    ja_existente: number
    atualizado: number
    descartado: number
  }
  por_fonte: Record<
    string,
    {
      total: number
      importado: number
      ja_existente: number
      atualizado: number
      descartado: number
    }
  >
  por_criterio_duplicidade?: {
    registro_mapa: number
    nome_ncm: number
    ncm_pa_fabricante: number
    outro: number
  }
}

export interface RelatorioIntegracaoCompleto {
  total_itens: number
  contadores: ContadoresDesfecho
  itens: ItemRelatorioIntegracao[]
}

export interface DetalheFonteSincronizacao {
  fonte: OrigemFonteSincronizacao
  nome: string
  url: string
  portalUrl: string
  status: 'pendente' | 'baixando' | 'processando' | 'concluido' | 'indisponivel'
  mensagem: string
  total_baixado: number
  novos_cadastrados: number
  atualizados: number
  ignorados_duplicidade: number
  descartados?: number
  itens_amostra?: {
    nome: string
    registro_mapa: string
    ncm_padrao: string
    principio_ativo: string
    pertence_nota_subpos_2: string
    cst_recomendado: string
  }[]
}

export interface ProdutoClassificadoSincronizacao {
  origem_base: string
  numero_registro_mapa: string
  marcas_comerciais: string
  titular_registro: string
  principio_ativo_garantias: string
  classe_uso?: string
  macro_grupo_subgrupo: string
  pertence_nota_subpos_2: 'SIM' | 'NÃO'
  ncm_padrao: string
  ncm_faixa1_ate_300g: string
  ncm_faixa2_300g_a_7_5kg: string
  ncm_faixa3_7_5kg_a_10kg: string
  ncm_faixa4_acima_10kg: string
  regra_tipi_embalagem: string
  enquadramento_pis_cofins: string
  cst_recomendado: string
  ibs_cbs_2027: string
  match_matriz_local: boolean
}

export interface RespostaSincronizacao {
  sucesso: boolean
  historico_id?: string | null
  duracao_ms: number
  auto_inclusao: boolean
  resumo: {
    total_baixado: number
    novos_cadastrados: number
    atualizados: number
    ignorados_duplicidade: number
    descartados?: number
  }
  fontes: DetalheFonteSincronizacao[]
  amostra_produtos: ProdutoClassificadoSincronizacao[]
  relatorio_integracao?: RelatorioIntegracaoCompleto
}

export interface HistoricoSincronizacaoRecord extends RecordModel {
  fontes_executadas: string[] | string
  auto_inclusao: boolean
  total_baixado: number
  novos_cadastrados: number
  atualizados: number
  ignorados_duplicidade: number
  detalhes_fontes: DetalheFonteSincronizacao[] | string
  duracao_ms: number
  status_geral: 'concluido' | 'parcial' | 'falha_total'
  itens_relatorio?: ItemRelatorioIntegracao[] | string
  contadores_desfecho?: ContadoresDesfecho | string
  created: string
  updated: string
}
