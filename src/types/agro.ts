import type { RecordModel } from 'pocketbase'

export interface RegraNcmEmbalagem extends RecordModel {
  ncm: string
  descricao: string
  embalagens_permitidas: string[]
  regra_especial?: string
  created: string
  updated: string
}

// -----------------------------------------------------------------------------
// Tipos para Cadastro de Bula (Estrutura Mestre + Blocos Acessórios)
// -----------------------------------------------------------------------------

export interface BulaProdutoItem extends RecordModel {
  registro_mapa: string
  nome_comercial: string
  marca_padronizada?: string
  titular_registro?: string
  fabricante_formulador?: string
  principio_ativo?: string
  classe_agronomica?: string
  grupo_quimico?: string
  classificacao_toxicologica?: string
  classificacao_ambiental?: string
  tipo_formulacao?: string
  modo_acao?: string
  tipo_produto?: string
  status_registro?: string
  codigo?: string
  pa_oficial_correto?: string
  mapa_oficial_limpo?: string
  embalagem?: string
  url_oficial?: string
  macro_grupo?: string
  sub_grupo?: string
  nota_subpos_2?: string
  regra_tipi?: string
  dados_extras?: Record<string, unknown>
  created: string
  updated: string
}

export interface BulaComposicaoItem extends RecordModel {
  registro_mapa: string
  nome_produto?: string
  ingrediente_ativo: string
  nome_quimico?: string
  numero_cas?: string
  concentracao?: string
  unidade_medida?: string
  funcao_ingrediente?: string
  grupo_quimico?: string
  codigo?: string
  percentual_peso?: string
  percentual_volume?: string
  dados_extras?: Record<string, unknown>
  created: string
  updated: string
}

export interface BulaEmpresaItem extends RecordModel {
  registro_mapa: string
  nome_produto?: string
  tipo_relacao?: string
  razao_social: string
  nome_fantasia?: string
  cnpj?: string
  endereco?: string
  municipio?: string
  uf?: string
  pais?: string
  codigo?: string
  cep?: string
  bairro?: string
  inscricao_estadual?: string
  dados_extras?: Record<string, unknown>
  created: string
  updated: string
}

export interface BulaEmbalagemItem extends RecordModel {
  registro_mapa: string
  nome_produto?: string
  tipo_embalagem?: string
  material?: string
  capacidade?: string
  unidade_medida?: string
  destinacao_final?: string
  codigo?: string
  descricao_embalagem?: string
  dados_extras?: Record<string, unknown>
  created: string
  updated: string
}

export interface BulaCulturaItem extends RecordModel {
  registro_mapa: string
  nome_produto?: string
  cultura: string
  intervalo_seguranca_dias?: string
  intervalo_reentrada_horas?: string
  modalidade_emprego?: string
  limite_maximo_residuos_lmr?: string
  observacoes?: string
  codigo?: string
  tipo_cultura?: string
  epoca_carencia?: string
  dados_extras?: Record<string, unknown>
  created: string
  updated: string
}

export interface BulaAlvoItem extends RecordModel {
  registro_mapa: string
  nome_produto?: string
  cultura?: string
  alvo_biologico: string
  nome_cientifico?: string
  dose_minima?: string
  dose_maxima?: string
  unidade_dose?: string
  volume_calda?: string
  numero_maximo_aplicacoes?: string
  epoca_aplicacao?: string
  codigo?: string
  tipo_alvo?: string
  intervalo_aplicacao_dias?: string
  dados_extras?: Record<string, unknown>
  created: string
  updated: string
}

export interface BulaAplicacaoItem extends RecordModel {
  registro_mapa: string
  nome_produto?: string
  tipo_aplicacao?: string
  equipamento_recomendado?: string
  condicoes_meteorologicas?: string
  epi_preparo_calda?: string
  epi_aplicacao?: string
  medidas_primeiros_socorros?: string
  descarte_embalagens?: string
  codigo?: string
  volume_calda_aplicacao?: string
  classe_toxicologica_aplicacao?: string
  orientacoes_gerais?: string
  dados_extras?: Record<string, unknown>
  created: string
  updated: string
}

export interface BulaCompletaResponse {
  produto: BulaProdutoItem
  composicao: BulaComposicaoItem[]
  empresas: BulaEmpresaItem[]
  embalagens: BulaEmbalagemItem[]
  culturas: BulaCulturaItem[]
  alvos: BulaAlvoItem[]
  aplicacao: BulaAplicacaoItem[]
}

export interface DicionarioPrincipioAtivo extends RecordModel {
  // Contrato Canônico de 13 Campos Químico-Fiscais (v2.5.0)
  principio_ativo_chave: string
  macro_grupo_subgrupo_padrao: string
  nota_subpos_2: 'SIM' | 'NÃO'
  ncm_padrao_referencia: string
  ncm_faixa1_ate_300g: string
  ncm_faixa2_300g_a_7_5kg: string
  ncm_faixa3_7_5kg_a_10kg: string
  ncm_faixa4_acima_10kg: string
  ncm_granel_tecnico: string
  regra_tipi_embalagem: string
  sistema_registro_mapa: string
  enquadramento_pis_cofins: string
  cst_recomendado: string

  // Legado e compatibilidade
  principio_ativo?: string
  classe?: string
  grupo_quimico?: string
  concentracao_min?: number
  concentracao_max?: number
  unidade?: string
  status?: string
  created: string
  updated: string

  // Campo calculado/enriquecido no cliente
  total_produtos_vinculados?: number
}

export type StatusValidacao = 'aprovado' | 'reprovado' | 'pendente'

export type TipoProdutoCanonico =
  | 'Produto Formulado Comercial'
  | 'Produto Técnico Industrial'
  | 'Pré-Mistura Industrial'
  | 'Fertilizante Mineral / Organomineral'
  | 'Inoculante / Biológico'
  | 'Corretivo / Condicionador de Solo'
  | 'Semente Certificada'
  | 'Adjuvante / Espalhante Adesivo'
  | 'Outros Insumos Químicos e Reagentes'

export type UnidadeFisicaCanonica = 'L' | 'KG' | 'SC' | 'UN' | 'DOSES'

export interface BaseMestreProduto extends RecordModel {
  // Contrato Canônico de 28 Campos (v2.4.0) + FK Matriz de PAs
  principio_ativo_id?: string
  nome_completo?: string
  marca_padronizada?: string
  tipo_produto?: TipoProdutoCanonico
  // Campos refinados por Embalagem Comercial (SKU Final)
  quantidade_embalagem_principal?: number
  unidade_medida_principal?: string
  forma_acondicionamento?: string
  embalagem_original?: string
  ncm_especifica?: string

  embalagem: string
  unidade?: UnidadeFisicaCanonica
  principio_ativo: string
  macro_grupo?: string
  sub_grupo?: string
  nota_subpos_2?: 'SIM' | 'NÃO'
  ncm_padrao?: string
  ncm_faixa1_ate_300g?: string
  ncm_faixa2_300g_a_7_5kg?: string
  ncm_faixa3_7_5kg_a_10kg?: string
  ncm_faixa4_acima_10kg?: string
  regra_tipi?: string
  registro_mapa: string
  sistema_norma_mapa?: string
  titular_fabricante?: string
  origem_base?: string
  status_pis_cofins?: string
  aliquota_ate_mar2026?: string
  aliquota_pos_abr2026_real?: string
  aliquota_pos_abr2026_presumido?: string
  cst_saida?: string
  cst_entrada?: string
  ibs_cbs_2027?: string
  url_oficial?: string

  // Legado e compatibilidade
  nome_produto?: string
  ncm?: string
  fabricante?: string
  concentracao?: number
  unidade_concentracao?: string
  status_validacao?: StatusValidacao
  data_inclusao?: string
  macro_grupo_subgrupo?: string
  regra_tipi_embalagem?: string
  cst_recomendado?: string
  dados_classificacao?: string
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

export type StatusValidacaoCampo =
  | 'OK'
  | 'DIVERGENTE'
  | 'RESSALVA'
  | 'NÃO INFORMADO'
  | 'NÃO LOCALIZADO'

export interface CampoValidadoResultado {
  campo: string
  chave: string
  obrigatorio: boolean
  informado: string
  encontrado_bula: string
  status: StatusValidacaoCampo
  explicacao: string
}

export interface LinhaNcmEmbalagem {
  faixa_id: number
  faixa_nome: string
  faixa_rotulo: string
  exemplo_embalagem: string
  ncm_correta: string
  ncm_informada_se_aplica: boolean
  status_aplicacao: string
  observacao: string
}

export interface DivergenciaCadastroExistente {
  campo: string
  valor_gravado: string
  valor_correto_bula: string
  sugestao: string
}

export interface ComparacaoExistenteResultado {
  id_registro: string
  produto_gravado: {
    id: string
    nome_completo: string
    marca_padronizada?: string
    ncm: string
    principio_ativo: string
    registro_mapa: string
    fabricante: string
    embalagem: string
  }
  divergencias: DivergenciaCadastroExistente[]
  necessita_atualizacao: boolean
}

export interface BulaOficialExtraida {
  encontrado: boolean
  nome_comercial_oficial?: string
  principio_ativo?: string
  fabricante?: string
  registro_mapa?: string
  classe_uso?: string
  formulacao?: string
  embalagens_autorizadas?: string[]
  embalagem_principal?: string
  quantidade_embalagem_principal?: string
  resumo_bula?: string
  link_oficial?: string
}

export interface GravacaoBaseMestreResultado {
  executada: boolean
  acao: 'criado' | 'atualizado' | 'nenhuma'
  id_registro?: string | null
  mensagem: string
}

export interface ValidarCadastroInput {
  nome_comercial: string
  ncm?: string
  principio_ativo?: string
  codigo_mapa?: string
  registro_mapa?: string
  embalagem?: string
  fabricante?: string
  concentracao?: number | string
  modo?: 'novo' | 'existente'
  id_produto_existente?: string
  auto_cadastrar?: boolean
}

export interface RespostaValidacaoCadastro {
  veredito_geral: 'APROVADO' | 'APROVADO COM RESSALVAS' | 'REPROVADO'
  status: 'APROVADO' | 'REPROVADO'
  veredito_motivo: string
  modo: 'novo' | 'existente'
  score: number
  total_travas: number
  total_aprovadas: number
  campos_validacao: CampoValidadoResultado[]
  possui_diferenca_ncm_embalagem: boolean
  linhas_ncm_embalagem: LinhaNcmEmbalagem[]
  travas: TravaResultado[]
  comparacao_existente?: ComparacaoExistenteResultado | null
  fontes_consultadas: FonteConsultada[]
  bula_extraida?: BulaOficialExtraida | null
  gravacao_base_mestre?: GravacaoBaseMestreResultado
  produto_canonico?: Partial<BaseMestreProduto>
  base_mestre_inclusao?: BaseMestreInclusaoResultado
  produto_validado: ProdutoValidadoConsolidado
  timestamp?: string
  data_validacao?: string
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
  nome_comercial?: string
  codigo_mapa?: string
  modo?: 'novo' | 'existente'
  id_produto_existente?: string
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
