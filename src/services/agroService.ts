import pb from '@/lib/pocketbase/client'
import type {
  RegraNcmEmbalagem,
  DicionarioPrincipioAtivo,
  BaseMestreProduto,
  ParametrizacaoFiscal,
  LogValidacao,
  RelatorioValidacao,
  ProdutoInput,
  ValidarCadastroInput,
  RespostaValidacaoCadastro,
  RespostaSincronizacao,
  HistoricoSincronizacaoRecord,
  BulaProdutoItem,
  BulaComposicaoItem,
  BulaEmpresaItem,
  BulaEmbalagemItem,
  BulaCulturaItem,
  BulaAlvoItem,
  BulaAplicacaoItem,
} from '@/types/agro'

// -----------------------------------------------------------------------------
// Sincronização de Produtos Oficiais (MAPA / AGROFIT / SIPEAGRO)
// -----------------------------------------------------------------------------
export async function executarSincronizacaoProdutos(params?: {
  fontes?: string[]
  auto_inclusao?: boolean
  limite_por_fonte?: number
}): Promise<RespostaSincronizacao> {
  try {
    return await pb.send<RespostaSincronizacao>('/backend/v1/sincronizar-produtos', {
      method: 'POST',
      body: params || {},
    })
  } catch (err: any) {
    const errorMsg =
      err?.data?.error ||
      err?.data?.message ||
      err?.message ||
      (typeof err === 'string' ? err : 'Falha na comunicação com o servidor de sincronização.')
    throw new Error(errorMsg)
  }
}

export async function listarHistoricoSincronizacao(params?: {
  page?: number
  perPage?: number
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 20
  const sort = params?.sort || '-created'
  return pb
    .collection('sincronizacao_historico')
    .getList<HistoricoSincronizacaoRecord>(page, perPage, {
      sort,
    })
}

export async function obterHistoricoSincronizacaoPorId(id: string) {
  return pb.collection('sincronizacao_historico').getOne<HistoricoSincronizacaoRecord>(id)
}

// -----------------------------------------------------------------------------
// Validação no Servidor (Hook Customizado)
// -----------------------------------------------------------------------------
export async function validarProdutoServidor(
  dados: ProdutoInput | ValidarCadastroInput,
): Promise<RelatorioValidacao & RespostaValidacaoCadastro> {
  const token = pb.authStore.token
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''

  const response = await fetch(`${baseUrl}/backend/v1/validar-produto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify(dados),
  })

  if (!response.ok) {
    let msg = `Erro na validação (HTTP ${response.status})`
    try {
      const data = await response.json()
      if (data?.error || data?.message) msg = data.error || data.message
    } catch {
      /* intentionally ignored */
    }
    throw new Error(msg)
  }

  return (await response.json()) as RelatorioValidacao & RespostaValidacaoCadastro
}

/**
 * Validação de cadastro canônica com o contrato exato dos 5 campos
 */
export async function validarCadastroProduto(
  dados: ValidarCadastroInput,
): Promise<RespostaValidacaoCadastro> {
  return validarProdutoServidor(dados)
}

// -----------------------------------------------------------------------------
// Base Mestre
// -----------------------------------------------------------------------------
export async function listarBaseMestre(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 30
  const sort = params?.sort || '-created'
  return pb.collection('base_mestre').getList<BaseMestreProduto>(page, perPage, {
    filter: params?.filter,
    sort,
  })
}

export async function criarProdutoBaseMestre(data: Partial<BaseMestreProduto>) {
  const payload: Record<string, unknown> = { ...data }
  if (data.marca_padronizada && !payload.nome_produto) {
    payload.nome_produto = data.marca_padronizada
  }
  if (data.ncm_padrao && !payload.ncm) {
    payload.ncm = data.ncm_padrao.replace(/\D/g, '')
  }
  if (data.titular_fabricante && !payload.fabricante) {
    payload.fabricante = data.titular_fabricante
  }
  return pb.collection('base_mestre').create<BaseMestreProduto>(payload)
}

export async function atualizarProdutoBaseMestre(id: string, data: Partial<BaseMestreProduto>) {
  const payload: Record<string, unknown> = { ...data }
  if (data.marca_padronizada && !payload.nome_produto) {
    payload.nome_produto = data.marca_padronizada
  }
  if (data.ncm_padrao && !payload.ncm) {
    payload.ncm = data.ncm_padrao.replace(/\D/g, '')
  }
  if (data.titular_fabricante && !payload.fabricante) {
    payload.fabricante = data.titular_fabricante
  }
  return pb.collection('base_mestre').update<BaseMestreProduto>(id, payload)
}

export async function excluirProdutoBaseMestre(id: string) {
  return pb.collection('base_mestre').delete(id)
}

/**
 * Consulta a Base Mestre e resolve a NCM pela chave natural da embalagem:
 * registro_mapa + quantidade + unidade + acondicionamento
 */
export async function resolverNcmBaseMestre(
  registroMapa: string,
  quantidade?: number | string,
  unidade?: string,
  acondicionamento?: string,
): Promise<{
  ncmEspecifica: string
  quantidade: number
  unidade: string
  acondicionamento: string
} | null> {
  try {
    const regDigits = String(registroMapa || '').replace(/\D/g, '')
    if (!regDigits) return null

    const qtdNum = Number(quantidade) || 0
    const unStr = String(unidade || '')
      .trim()
      .toUpperCase()
    const acondStr = String(acondicionamento || '').trim()

    // 1. Tentar busca exata por registro_mapa e campos de embalagem
    let filter = `registro_mapa ~ '${regDigits}'`
    if (qtdNum > 0) {
      filter += ` && quantidade_embalagem_principal = ${qtdNum}`
    }
    if (unStr) {
      filter += ` && unidade_medida_principal = '${unStr}'`
    }
    if (acondStr) {
      filter += ` && forma_acondicionamento = '${acondStr}'`
    }

    const res = await pb.collection('base_mestre').getList<BaseMestreProduto>(1, 10, {
      filter,
      sort: '-created',
    })

    const match =
      res.items.find((item) => {
        const itemRegDigits = (item.registro_mapa || '').replace(/\D/g, '')
        if (itemRegDigits !== regDigits) return false
        if (qtdNum > 0 && item.quantidade_embalagem_principal !== qtdNum) return false
        if (unStr && (item.unidade_medida_principal || '').toUpperCase() !== unStr) return false
        if (acondStr && item.forma_acondicionamento !== acondStr) return false
        return true
      }) || res.items[0]

    if (match) {
      const ncm = (match.ncm_especifica || match.ncm_padrao || match.ncm || '').trim()
      return {
        ncmEspecifica: ncm,
        quantidade: match.quantidade_embalagem_principal || qtdNum || 20,
        unidade: match.unidade_medida_principal || unStr || 'L',
        acondicionamento: match.forma_acondicionamento || acondStr || 'Bombona',
      }
    }

    return null
  } catch (err) {
    console.error('Erro ao resolver NCM na Base Mestre:', err)
    return null
  }
}

// -----------------------------------------------------------------------------
// Relatório de Duplicidades no Servidor
// -----------------------------------------------------------------------------
export async function obterRelatorioDuplicidades() {
  return pb.send<{
    total_grupos: number
    total_produtos_duplicados: number
    grupos: import('@/types/agro').GrupoDuplicidade[]
  }>('/backend/v1/relatorio-duplicidades', {
    method: 'GET',
  })
}

// -----------------------------------------------------------------------------
// Regras NCM × Embalagem
// -----------------------------------------------------------------------------
export async function listarRegrasNcm(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 50
  const sort = params?.sort || 'ncm'
  return pb.collection('regras_ncm_embalagem').getList<RegraNcmEmbalagem>(page, perPage, {
    filter: params?.filter,
    sort,
  })
}

export async function criarRegraNcm(data: Partial<RegraNcmEmbalagem>) {
  return pb.collection('regras_ncm_embalagem').create<RegraNcmEmbalagem>(data)
}

export async function atualizarRegraNcm(id: string, data: Partial<RegraNcmEmbalagem>) {
  return pb.collection('regras_ncm_embalagem').update<RegraNcmEmbalagem>(id, data)
}

export async function excluirRegraNcm(id: string) {
  return pb.collection('regras_ncm_embalagem').delete(id)
}

// -----------------------------------------------------------------------------
// Dicionário de Princípios Ativos
// -----------------------------------------------------------------------------
export async function listarPrincipiosAtivos(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 50
  const sort = params?.sort || 'principio_ativo_chave'
  return pb
    .collection('dicionario_principios_ativos')
    .getList<DicionarioPrincipioAtivo>(page, perPage, {
      filter: params?.filter,
      sort,
    })
}

export async function criarPrincipioAtivo(data: Partial<DicionarioPrincipioAtivo>) {
  const chave = (data.principio_ativo_chave || data.principio_ativo || '').trim().toUpperCase()
  const payload = {
    ...data,
    principio_ativo_chave: chave,
    principio_ativo: chave,
  }
  return pb.collection('dicionario_principios_ativos').create<DicionarioPrincipioAtivo>(payload)
}

export async function atualizarPrincipioAtivo(id: string, data: Partial<DicionarioPrincipioAtivo>) {
  const payload = { ...data }
  if (payload.principio_ativo_chave || payload.principio_ativo) {
    const chave = (payload.principio_ativo_chave || payload.principio_ativo || '')
      .trim()
      .toUpperCase()
    payload.principio_ativo_chave = chave
    payload.principio_ativo = chave
  }
  return pb.collection('dicionario_principios_ativos').update<DicionarioPrincipioAtivo>(id, payload)
}

export async function excluirPrincipioAtivo(id: string) {
  return pb.collection('dicionario_principios_ativos').delete(id)
}

/**
 * Conta em tempo real quantos produtos da base_mestre estão vinculados a este princípio ativo
 */
export async function contarProdutosVinculadosAoPrincipioAtivo(paId: string): Promise<number> {
  try {
    const res = await pb.collection('base_mestre').getList(1, 1, {
      filter: `principio_ativo_id = "${paId}"`,
      fields: 'id',
    })
    return res.totalItems
  } catch (_) {
    return 0
  }
}

/**
 * Propaga as regras canônicas de um princípio ativo para todos os produtos vinculados em cascata
 */
export async function sincronizarPrincipioAtivoEmCascata(id: string): Promise<{
  sucesso: boolean
  mensagem: string
  total_vinculados: number
  atualizados: number
}> {
  return await pb.send<{
    sucesso: boolean
    mensagem: string
    total_vinculados: number
    atualizados: number
  }>(`/backend/v1/sincronizar-pa-cascata/${encodeURIComponent(id)}`, {
    method: 'POST',
  })
}

/**
 * Pipeline Dual-Sync Atômico (Seção 5 da especificação técnica 2.5.0)
 */
export async function importarNovoCadastroDualSync(dados: {
  nome_comercial_portal: string
  principio_ativo_declarado: string
  numero_registro_mapa: string
  classe_agronomica?: string
  titular_registro?: string
  embalagem_comercial?: string
  unidade_medida?: string
  origem_portal?: string
  url_publicacao_dou?: string
  simular_falha_ncm?: boolean
}) {
  return await pb.send<{
    sucesso: boolean
    mensagem: string
    principio_ativo_id: string
    principio_ativo_chave: string
    principio_ativo_novo_criado: boolean
    produto_mestre_id: string
    produto_mestre_nome: string
    registro_mapa: string
    ncm_padrao: string
    cst_saida: string
  }>('/backend/v1/importar-novo-cadastro', {
    method: 'POST',
    body: dados,
  })
}

// -----------------------------------------------------------------------------
// Parametrização Fiscal
// -----------------------------------------------------------------------------
export async function listarParametrizacaoFiscal(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 50
  const sort = params?.sort || 'ncm'
  return pb.collection('parametrizacao_fiscal').getList<ParametrizacaoFiscal>(page, perPage, {
    filter: params?.filter,
    sort,
  })
}

export async function salvarParametrizacaoFiscal(data: Partial<ParametrizacaoFiscal>) {
  if (data.id) {
    return pb.collection('parametrizacao_fiscal').update<ParametrizacaoFiscal>(data.id, data)
  }
  // Verificar se NCM já existe
  const ncm = String(data.ncm || '').trim()
  const existentes = await pb
    .collection('parametrizacao_fiscal')
    .getList<ParametrizacaoFiscal>(1, 1, {
      filter: `ncm = '${ncm}'`,
    })
  if (existentes.items.length > 0) {
    return pb
      .collection('parametrizacao_fiscal')
      .update<ParametrizacaoFiscal>(existentes.items[0].id, data)
  }
  return pb.collection('parametrizacao_fiscal').create<ParametrizacaoFiscal>(data)
}

// -----------------------------------------------------------------------------
// Log de Validações (Auditoria)
// -----------------------------------------------------------------------------
export async function listarLogValidacoes(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 50
  const sort = params?.sort || '-created'
  return pb.collection('log_validacoes').getList<LogValidacao>(page, perPage, {
    filter: params?.filter,
    sort,
  })
}

// -----------------------------------------------------------------------------
// Bulk Insert no Cliente para Importações (Chunked com delay para estabilidade)
// -----------------------------------------------------------------------------
export interface ItemErroImportacao {
  linhaOriginal: number
  linhaLote: number
  motivo: string
  categoria: string
  campo?: string
  valor?: string
  dados: Record<string, unknown>
}

export interface ResultadoImportacaoLote {
  inseridos: number
  atualizados?: number
  ignorados: number
  espelhadosBaseMestre?: number
  erros: ItemErroImportacao[]
  resumoCategorias: Record<string, number>
}

// -----------------------------------------------------------------------------
// Limpeza Segura de Bases (base_mestre / dicionario_principios_ativos)
// -----------------------------------------------------------------------------
export interface RespostaLimpezaBases {
  sucesso: boolean
  mensagem: string
  executado_por?: string
  alvo: string
  apagados: {
    base_mestre: number
    dicionario_principios_ativos: number
    total: number
  }
  preservados: string[]
  timestamp: string
}

export async function limparBases(params: {
  alvo: 'todas' | 'base_mestre' | 'dicionario_principios_ativos'
  confirmar: string
}): Promise<RespostaLimpezaBases> {
  return pb.send<RespostaLimpezaBases>('/backend/v1/limpar-bases', {
    method: 'POST',
    body: params,
  })
}

/**
 * Importação em lote resiliente com controle de concorrência,
 * auto-retry exponencial contra rate-limit 429 e relatório detalhado com auditoria de erros.
 */
/**
 * Importação em lote resiliente executada diretamente no servidor via pb_hooks (POST /backend/v1/importar-lote).
 * Envia os dados em chunks seguros (ex.: 200 linhas por chamada) em vez de requisição registro a registro,
 * eliminando por completo rajadas de requisições e o rate limit HTTP 429.
 * Inclui auto-retry com backoff exponencial para resiliência máxima e relatório detalhado com campo/valor exatos.
 */
export async function importarEmLote<T extends Record<string, unknown>>(
  collectionName: string,
  records: { data: T; originalLine?: number }[],
  onProgress?: (processados: number, total: number) => void,
): Promise<ResultadoImportacaoLote> {
  let inseridos = 0
  let atualizados = 0
  let ignorados = 0
  let espelhadosBaseMestre = 0
  const erros: ItemErroImportacao[] = []
  const resumoCategorias: Record<string, number> = {}
  const total = records.length

  if (total === 0) {
    return {
      inseridos: 0,
      atualizados: 0,
      ignorados: 0,
      espelhadosBaseMestre: 0,
      erros: [],
      resumoCategorias: {},
    }
  }

  const token = pb.authStore.token
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''
  const endpointUrl = `${baseUrl}/backend/v1/importar-lote`

  // Chunking seguro: 200 registros por requisição para manter o payload leve e estável
  const CHUNK_SIZE = 200
  let processados = 0

  for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
    const chunk = records.slice(offset, offset + CHUNK_SIZE)
    const payload = {
      collection: collectionName,
      records: chunk,
    }

    let respostaChunk: {
      sucesso: boolean
      inseridos: number
      atualizados: number
      ignorados: number
      espelhadosBaseMestre?: number
      erros: ItemErroImportacao[]
      resumoCategorias: Record<string, number>
      error?: string
    } | null = null

    let tentativas = 0
    const maxTentativas = 4
    let sucessoEnvio = false

    while (!sucessoEnvio && tentativas < maxTentativas) {
      try {
        const response = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: token } : {}),
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const status = response.status
          let errorMsg = `HTTP ${status}`
          try {
            const errJson = await response.json()
            errorMsg = errJson.error || errJson.message || errorMsg
          } catch (_) {
            try {
              const text = await response.text()
              if (text) errorMsg = text.slice(0, 200)
            } catch {
              /* noop */
            }
          }

          if (status === 429 && tentativas < maxTentativas - 1) {
            tentativas++
            const delay = tentativas * 800 + Math.random() * 400
            await new Promise((resolve) => setTimeout(resolve, delay))
            continue
          }

          throw new Error(errorMsg)
        }

        respostaChunk = await response.json()
        sucessoEnvio = true
      } catch (err: unknown) {
        tentativas++
        if (tentativas >= maxTentativas) {
          // Registrar erro para cada item do chunk se o bloco falhou definitivamente
          const msg = err instanceof Error ? err.message : String(err)
          const is429 = msg.includes('429') || msg.toLowerCase().includes('too many requests')
          const categoria = is429 ? 'Limite de Requisições (429)' : 'Erro no Banco de Dados'

          chunk.forEach((item, idxInChunk) => {
            const rowNum = item.originalLine ?? offset + idxInChunk + 1
            erros.push({
              linhaOriginal: rowNum,
              linhaLote: offset + idxInChunk + 1,
              motivo: msg,
              categoria,
              campo: 'Servidor',
              valor: 'Falha no endpoint em lote',
              dados: item.data,
            })
            resumoCategorias[categoria] = (resumoCategorias[categoria] || 0) + 1
          })
          break
        }
        const delay = tentativas * 600 + Math.random() * 300
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    if (respostaChunk) {
      inseridos += respostaChunk.inseridos || 0
      atualizados += respostaChunk.atualizados || 0
      ignorados += respostaChunk.ignorados || 0
      espelhadosBaseMestre += respostaChunk.espelhadosBaseMestre || 0

      if (Array.isArray(respostaChunk.erros)) {
        respostaChunk.erros.forEach((err) => {
          erros.push(err)
          const cat = err.categoria || 'Erro no Banco de Dados'
          resumoCategorias[cat] = (resumoCategorias[cat] || 0) + 1
        })
      }
    }

    processados += chunk.length
    if (onProgress) {
      onProgress(Math.min(processados, total), total)
    }
  }

  return { inseridos, atualizados, ignorados, espelhadosBaseMestre, erros, resumoCategorias }
}

// -----------------------------------------------------------------------------
// Serviços do Cadastro de Bula (Mestre + 6 Blocos Acessórios)
// -----------------------------------------------------------------------------

export async function listarBulasProdutos(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 30
  const sort = params?.sort || 'nome_comercial'
  return pb.collection('bula_produtos').getList<BulaProdutoItem>(page, perPage, {
    filter: params?.filter,
    sort,
  })
}

export async function obterBulaProdutoPorId(id: string) {
  return pb.collection('bula_produtos').getOne<BulaProdutoItem>(id)
}

export async function criarBulaProduto(data: Partial<BulaProdutoItem>) {
  return pb.collection('bula_produtos').create<BulaProdutoItem>(data)
}

export async function atualizarBulaProduto(id: string, data: Partial<BulaProdutoItem>) {
  return pb.collection('bula_produtos').update<BulaProdutoItem>(id, data)
}

export async function excluirBulaProduto(id: string) {
  return pb.collection('bula_produtos').delete(id)
}

// Blocos Acessórios filtrados pelo registro_mapa do produto
export async function listarBulaComposicao(registroMapa: string) {
  const cleanMapa = registroMapa.replace(/'/g, "\\'")
  return pb.collection('bula_composicao').getFullList<BulaComposicaoItem>({
    filter: `registro_mapa = '${cleanMapa}'`,
    sort: 'ingrediente_ativo',
  })
}

export async function listarBulaEmpresas(registroMapa: string) {
  const cleanMapa = registroMapa.replace(/'/g, "\\'")
  return pb.collection('bula_empresas').getFullList<BulaEmpresaItem>({
    filter: `registro_mapa = '${cleanMapa}'`,
    sort: 'tipo_relacao,razao_social',
  })
}

export async function listarBulaEmbalagens(registroMapa: string) {
  const cleanMapa = registroMapa.replace(/'/g, "\\'")
  return pb.collection('bula_embalagens').getFullList<BulaEmbalagemItem>({
    filter: `registro_mapa = '${cleanMapa}'`,
    sort: 'tipo_embalagem,capacidade',
  })
}

export async function listarBulaCulturas(registroMapa: string) {
  const cleanMapa = registroMapa.replace(/'/g, "\\'")
  return pb.collection('bula_culturas').getFullList<BulaCulturaItem>({
    filter: `registro_mapa = '${cleanMapa}'`,
    sort: 'cultura',
  })
}

export async function listarBulaAlvos(registroMapa: string) {
  const cleanMapa = registroMapa.replace(/'/g, "\\'")
  return pb.collection('bula_alvos').getFullList<BulaAlvoItem>({
    filter: `registro_mapa = '${cleanMapa}'`,
    sort: 'cultura,alvo_biologico',
  })
}

export async function listarBulaAplicacao(registroMapa: string) {
  const cleanMapa = registroMapa.replace(/'/g, "\\'")
  return pb.collection('bula_aplicacao').getFullList<BulaAplicacaoItem>({
    filter: `registro_mapa = '${cleanMapa}'`,
    sort: 'tipo_aplicacao',
  })
}

export interface RespostaLimpezaBula {
  sucesso: boolean
  mensagem: string
  executado_por?: string
  apagados: {
    bula_produtos: number
    bula_composicao: number
    bula_empresas: number
    bula_embalagens: number
    bula_culturas: number
    bula_alvos: number
    bula_aplicacao: number
    total: number
  }
  preservados: string[]
  timestamp: string
}

export async function limparCadastroBula(params: {
  confirmar: string
}): Promise<RespostaLimpezaBula> {
  return pb.send<RespostaLimpezaBula>('/backend/v1/limpar-bula', {
    method: 'POST',
    body: params,
  })
}

// -----------------------------------------------------------------------------
// Importação de Bula a partir de PDF (Parser $documents + Gravação Atômica)
// -----------------------------------------------------------------------------

export interface RespostaAnaliseBulaPdf {
  sucesso: boolean
  error?: string
  arquivo?: {
    nome: string
    tamanho: number
    truncado?: boolean
  }
  checklist?: {
    registro_mapa: { encontrado: boolean; valor: string }
    nome_comercial: { encontrado: boolean; valor: string }
    composicao: { encontrado: boolean; total: number; itens: string[] }
    empresas: {
      encontrado: boolean
      total: number
      titular: string
      fabricantes: number
      formuladores: number
    }
    classificacoes: {
      encontrado: boolean
      toxicologica: string
      ambiental: string
      classe_agronomica: string
    }
    culturas: { encontrado: boolean; total: number }
    alvos: { encontrado: boolean; total: number }
    aplicacao_epi: { encontrado: boolean; volume_calda?: string; reentrada?: string }
  }
  dados_extraidos: {
    produto: Partial<BulaProdutoItem>
    composicao: Partial<BulaComposicaoItem>[]
    empresas: Partial<BulaEmpresaItem>[]
    embalagens: Partial<BulaEmbalagemItem>[]
    culturas: Partial<BulaCulturaItem>[]
    alvos: Partial<BulaAlvoItem>[]
    aplicacao: Partial<BulaAplicacaoItem>[]
  }
}

export interface RespostaGravacaoBulaPdf {
  sucesso: boolean
  mensagem?: string
  error?: string
  registro_mapa?: string
  nome_comercial?: string
  contadores?: {
    bula_produtos: { inseridos: number; atualizados: number }
    bula_composicao: { inseridos: number; atualizados: number }
    bula_empresas: { inseridos: number; atualizados: number }
    bula_embalagens: { inseridos: number; atualizados: number }
    bula_culturas: { inseridos: number; atualizados: number }
    bula_alvos: { inseridos: number; atualizados: number }
    bula_aplicacao: { inseridos: number; atualizados: number }
    base_mestre?: { inseridos: number; atualizados: number }
  }
}

export interface RespostaRecalculoBulaPa {
  sucesso: boolean
  mensagem?: string
  error?: string
  totalAnalisados: number
  totalAtualizados: number
  mantidosPreenchidos: number
  semFonte?: number
  detalhesFontes: {
    resolvidosPorComposicao: number
    resolvidosPorBaseMestre: number
    resolvidosPorExtras: number
  }
  exemplos?: Array<{
    nome_comercial: string
    registro_mapa: string
    principio_ativo: string
    ncm_padrao?: string
    fonte: string
  }>
  totalErros?: number
  erros?: Array<any>
}

export async function recalcularPrincipiosAtivosBula(): Promise<RespostaRecalculoBulaPa> {
  try {
    return await pb.send<RespostaRecalculoBulaPa>('/backend/v1/bula/recalcular-principios-ativos', {
      method: 'POST',
    })
  } catch (err: any) {
    const errorMsg =
      err?.response?.data?.error ||
      err?.data?.error ||
      err?.response?.data?.message ||
      (err?.message && !/^Something went wrong/i.test(err.message) ? err.message : '') ||
      'Falha ao recalcular princípios ativos no servidor. Tente novamente.'
    throw new Error(errorMsg)
  }
}

export async function analisarBulaPdf(arquivoPdf: File): Promise<RespostaAnaliseBulaPdf> {
  const formData = new FormData()
  formData.append('arquivo', arquivoPdf)

  try {
    return await pb.send<RespostaAnaliseBulaPdf>('/backend/v1/bula/analisar-pdf', {
      method: 'POST',
      body: formData,
    })
  } catch (err: any) {
    const errorMsg =
      err?.response?.data?.error ||
      err?.data?.error ||
      err?.response?.data?.message ||
      (err?.message && !/^Something went wrong/i.test(err.message) ? err.message : '') ||
      'Falha na análise do arquivo PDF de bula. Tente novamente.'
    throw new Error(errorMsg)
  }
}

export async function gravarBulaPdf(
  dadosExtraidos: RespostaAnaliseBulaPdf['dados_extraidos'],
): Promise<RespostaGravacaoBulaPdf> {
  try {
    return await pb.send<RespostaGravacaoBulaPdf>('/backend/v1/bula/gravar-pdf', {
      method: 'POST',
      body: { dados: dadosExtraidos },
    })
  } catch (err: any) {
    const errorMsg =
      err?.response?.data?.error ||
      err?.data?.error ||
      err?.response?.data?.message ||
      (err?.message && !/^Something went wrong/i.test(err.message) ? err.message : '') ||
      'Falha ao gravar os dados da bula no banco de dados. Tente novamente.'
    throw new Error(errorMsg)
  }
}

// -----------------------------------------------------------------------------
// Simulador Comercial (Fase 1 - MVP)
// -----------------------------------------------------------------------------

export interface SimProdutoBaseItem {
  id: string
  codigo?: string
  descricao: string
  ncm?: string
  unidade?: string
  tipo_produto?: string
  origem?: string
  embalagem?: string
  principio_ativo?: string
  fabricante?: string
  moeda?: string
  preco_base_sugerido?: number
  gr_trib?: string
  dados_extras?: Record<string, unknown>
  created: string
  updated: string
}

export interface SimRegraIcmsItem {
  id: string
  uf_origem: string
  uf_destino: string
  aliquota_icms: number
  reducao_base?: number
  aliquota_efetiva?: number
  diferimento?: boolean
  percentual_diferimento?: number
  fundamentacao_legal?: string
  tipo_operacao?: string
  chave_origem_destino: string
  id_regra?: string
  tipo_uf_origem?: string
  tipo_uf_destino?: string
  grupo_tributario_codigo?: string
  grupo_tributario_descricao?: string
  prod_importado?: string
  tipo_desonerado?: string
  icms_desonerado?: number
  regra_credito_entrada?: string
  dados_extras?: Record<string, unknown>
  created: string
  updated: string
}

export async function listarProdutosBaseSimulador(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 50
  const sort = params?.sort || 'codigo'
  return pb.collection('sim_produtos_base').getList<SimProdutoBaseItem>(page, perPage, {
    filter: params?.filter,
    sort,
  })
}

export type AtualizarSimProdutoBaseInput = {
  descricao: string
  ncm?: string
  embalagem?: string
  unidade?: string
  tipo_produto?: string
  origem?: string
  moeda?: string
  preco_base_sugerido?: number
  gr_trib?: string
  fabricante?: string
  principio_ativo?: string
}

export async function atualizarProdutoBaseSimulador(
  id: string,
  data: AtualizarSimProdutoBaseInput,
) {
  // Preserva intencionalmente dados_extras sem sobrescrever nem remover
  const payload: Record<string, unknown> = {
    descricao: data.descricao.trim(),
    origem: data.origem || 'Nacional',
    moeda: data.moeda || 'BRL',
    preco_base_sugerido:
      typeof data.preco_base_sugerido === 'number' && !isNaN(data.preco_base_sugerido)
        ? data.preco_base_sugerido
        : 0,
  }

  if (data.ncm !== undefined) payload.ncm = data.ncm.trim()
  if (data.embalagem !== undefined) payload.embalagem = data.embalagem.trim()
  if (data.unidade !== undefined) payload.unidade = data.unidade.trim()
  if (data.tipo_produto !== undefined) payload.tipo_produto = data.tipo_produto.trim()
  if (data.gr_trib !== undefined) payload.gr_trib = data.gr_trib.trim()
  if (data.fabricante !== undefined) payload.fabricante = data.fabricante.trim()
  if (data.principio_ativo !== undefined) payload.principio_ativo = data.principio_ativo.trim()

  return pb.collection('sim_produtos_base').update<SimProdutoBaseItem>(id, payload)
}

export async function excluirProdutoBaseSimulador(id: string) {
  return pb.collection('sim_produtos_base').delete(id)
}

export async function listarRegrasIcmsSimulador(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 50
  const sort = params?.sort || 'uf_origem,uf_destino'
  return pb.collection('sim_regras_icms').getList<SimRegraIcmsItem>(page, perPage, {
    filter: params?.filter,
    sort,
  })
}

export async function obterRegraIcmsSimulador(
  ufOrigem: string,
  ufDestino: string,
  grTrib?: string,
): Promise<{
  regra: SimRegraIcmsItem | null
  statusCorrespondencia: 'exata' | 'fallback_uf' | 'nao_encontrada'
}> {
  const chave = `${ufOrigem.toUpperCase()}_${ufDestino.toUpperCase()}`
  const grTribLimpo = (grTrib || '').trim()

  try {
    // 1. Se o produto tem gr_trib, busca prioritariamente pela regra exata (par de UFs + grupo tributário)
    if (grTribLimpo) {
      const escGr = grTribLimpo.replace(/'/g, "\\'")
      const resExata = await pb.collection('sim_regras_icms').getList<SimRegraIcmsItem>(1, 1, {
        filter: `chave_origem_destino = '${chave}' && grupo_tributario_codigo = '${escGr}'`,
        sort: '-created',
      })
      if (resExata.items.length > 0) {
        return { regra: resExata.items[0], statusCorrespondencia: 'exata' }
      }
    }

    // 2. Fallback: regra do par de UFs sem filtro de grupo ou quando produto não tem gr_trib
    const resUf = await pb.collection('sim_regras_icms').getList<SimRegraIcmsItem>(1, 1, {
      filter: `chave_origem_destino = '${chave}'`,
      sort: '-created',
    })
    if (resUf.items.length > 0) {
      return { regra: resUf.items[0], statusCorrespondencia: 'fallback_uf' }
    }

    return { regra: null, statusCorrespondencia: 'nao_encontrada' }
  } catch (_) {
    return { regra: null, statusCorrespondencia: 'nao_encontrada' }
  }
}

export async function executarSimulacaoServidor(payload: {
  produto_id?: string
  produto_nome?: string
  ncm?: string
  gr_trib?: string
  uf_origem: string
  uf_destino: string
  quantidade: number
  preco_unitario: number
  ptax_manual?: number
  frete?: number
  seguro?: number
  outras_despesas?: number
  margem_perc?: number
}) {
  return pb.send<{
    sucesso: boolean
    produto: any
    operacao: any
    cambio: any
    valores_base: any
    tributos: any
    resultado_comercial: any
    alertas: string[]
    memoria_calculo: string[]
  }>('/backend/v1/simulador/calcular', {
    method: 'POST',
    body: payload,
  })
}
