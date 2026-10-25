/**
 * pocketbase/hooks/importar_lote.js
 * Endpoint de importação em lote de alta performance e resiliência:
 * POST /backend/v1/importar-lote
 *
 * Resolve definitivamente:
 * 1. Limite de Requisições (HTTP 429) por eliminar disparos de requisições individuais a partir do frontend.
 *    O frontend envia blocos (chunks) de até 200 linhas ou o lote inteiro por requisição,
 *    e o hook processa diretamente no servidor via transação/instância $app nativa.
 * 2. Validação estrita e higienização/normalização automática contra os schemas canônicos:
 *    - 'dicionario_principios_ativos' (Matriz Canônica de 13 Campos):
 *        * nota_subpos_2: apenas 'SIM' ou 'NÃO' (trata 'S', 'N', 'Sim', 'não', 'true', etc.)
 *        * NCMs: formato canônico '0000.00.00' com máscara e 8 dígitos
 *        * principio_ativo / principio_ativo_chave: UPPERCASE limpo
 *        * Upsert idempotente por principio_ativo_chave (ou principio_ativo)
 *    - 'base_mestre' (Catálogo Canônico de 28 Campos):
 *        * tipo_produto: select restrito normalizado para os 9 valores canônicos permitidos
 *        * unidade: select restrito ('L', 'KG', 'SC', 'UN', 'DOSES')
 *        * nota_subpos_2: 'SIM' ou 'NÃO'
 *        * status_validacao: 'aprovado' | 'reprovado' | 'pendente'
 *        * NCMs: máscara 0000.00.00
 *        * Registro MAPA: sanitizado preservando zeros (ex. Nº 0315)
 *        * Upsert idempotente via critérios da Trava 4 (Critério A: Registro MAPA; Critério B: Marca + NCM; Critério C: NCM + P.A. + Fabricante)
 *        * Vinculação automática com a matriz de princípios ativos (FK principio_ativo_id) garantindo Dual-Sync sem produtos órfãos.
 *    - 'regras_ncm_embalagem':
 *        * ncm: 8 dígitos limpos
 *        * embalagens_permitidas: array JSON
 *        * Upsert idempotente por NCM
 * 3. Auditoria transparente de recusas: Retorna explicitamente o campo, o valor identificado e o motivo real
 *    para exibição na interface sem campos "—".
 *
 * Observação do ambiente Goja/PocketBase:
 * Todas as funções auxiliares são declaradas inline dentro do handler para evitar ReferenceError entre pools de execução.
 */

routerAdd('POST', '/backend/v1/importar-lote', (e) => {
  try {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, {
        sucesso: false,
        error: 'Acesso não autorizado. É necessário estar autenticado.',
      })
    }
    const userRole = authRecord.getString('role') || 'analista'
    if (userRole !== 'admin') {
      return e.json(403, {
        sucesso: false,
        error: 'Apenas administradores podem realizar esta ação.',
      })
    }

    const info = e.requestInfo()
    const body = info.body || {}

    const collectionName = String(body.collection || '').trim()
    const records = Array.isArray(body.records) ? body.records : []

    if (!collectionName) {
      return e.json(400, { sucesso: false, error: 'Parâmetro "collection" é obrigatório.' })
    }

    if (records.length === 0) {
      return e.json(200, {
        sucesso: true,
        collection: collectionName,
        total: 0,
        inseridos: 0,
        atualizados: 0,
        ignorados: 0,
        erros: [],
        resumoCategorias: {},
      })
    }

    const colecoesSuportadas = [
      'dicionario_principios_ativos',
      'base_mestre',
      'regras_ncm_embalagem',
      'bula_produtos',
      'bula_composicao',
      'bula_empresas',
      'bula_embalagens',
      'bula_culturas',
      'bula_alvos',
      'bula_aplicacao',
      'sim_produtos_base',
      'sim_regras_icms',
    ]

    if (!colecoesSuportadas.includes(collectionName)) {
      return e.json(400, {
        sucesso: false,
        error: `Coleção "${collectionName}" não suportada para importação em lote. Permitidas: ${colecoesSuportadas.join(', ')}`,
      })
    }

    // -------------------------------------------------------------------------
    // Funções Auxiliares Inline
    // -------------------------------------------------------------------------
    function normTxt(s) {
      if (!s) return ''
      return String(s)
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
    }

    function fmtNcmMascara(raw) {
      const digits = String(raw || '').replace(/\D/g, '')
      if (digits.length === 8) {
        return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
      }
      if (digits.length > 0 && digits.length < 8) {
        const padded = digits.padStart(8, '0')
        return `${padded.slice(0, 4)}.${padded.slice(4, 6)}.${padded.slice(6, 8)}`
      }
      return raw ? String(raw).trim() : ''
    }

    function normalizarNotaSubpos2(val) {
      if (val === undefined || val === null || val === '') return 'NÃO'
      const s = String(val).trim().toUpperCase()
      if (s === 'SIM' || s === 'S' || s === 'TRUE' || s === '1' || s.startsWith('SIM')) return 'SIM'
      return 'NÃO'
    }

    function sanitizarMarca(nomeCompleto) {
      const texto = String(nomeCompleto || '').trim()
      if (!texto) return 'PRODUTO AGRO'
      const padraoEmb =
        /\s+(?:\d+\s*[xX]\s*\d+\s*[A-Za-z]+|\d+(?:[.,]\d+)?\s*(?:L|LT|LITROS|KG|G|SC|SACO|ML|DOSES)\b|\(IMP\)|\bTC\b|\bIMP\b).*/i
      let limpo = texto.replace(padraoEmb, '').trim()
      limpo = limpo.replace(/[-–—/]+$/, '').trim()
      return limpo || texto
    }

    function sanitizarMapa(reg) {
      if (!reg) return 'ISENTO'
      const s = String(reg).trim()
      if (!s) return 'ISENTO'
      const upper = s.toUpperCase()
      if (upper.includes('ISENTO')) return 'ISENTO'
      if (upper.startsWith('TC')) return upper
      if (s.includes('-')) return s
      if (s.startsWith('Nº ') || s.startsWith('Nº') || s.startsWith('N° ') || s.startsWith('N°')) {
        const semPrefixo = s.replace(/^N[º°]\s*/i, '').trim()
        const digits = semPrefixo.replace(/\D/g, '')
        if (digits.length > 0 && digits.length < 4) {
          return `Nº ${digits.padStart(4, '0')}`
        }
        if (digits.length > 0) {
          return `Nº ${digits}`
        }
        return `Nº ${semPrefixo}`
      }
      const digits = s.replace(/\D/g, '')
      if (digits.length > 0 && digits.length < 4) {
        return `Nº ${digits.padStart(4, '0')}`
      }
      if (digits.length > 0) {
        return `Nº ${digits}`
      }
      return s
    }

    const MOLECULAS_NOTA_SUBPOS_2 = [
      'BIFENTRINA',
      'LAMBDA-CIALOTRINA',
      'LAMBDA CIALOTRINA',
      'CLORFENAPIR',
      'CHLORFENAPYR',
      'MALATIONA',
      'MALATHION',
      'FENITROTIONA',
      'BETA-CIFLUTRINA',
      'BETA CIFLUTRINA',
      'CIFLUTRINA',
      'ALFA-CIPERMETRINA',
      'ALFA CIPERMETRINA',
      'ALPHA-CYPERMETHRIN',
      'DELTAMETRINA',
      'PERMETRINA',
      'PROPOXUR',
      'BENDIOCARBE',
      'BENDIOCARB',
    ]

    function verificarNota2Molecula(pa, nome) {
      const paUpper = `${String(pa || '')} ${String(nome || '')}`.toUpperCase()
      return MOLECULAS_NOTA_SUBPOS_2.some((mol) => paUpper.includes(mol))
    }

    const TIPOS_PRODUTO_CANONICOS = [
      'Produto Formulado Comercial',
      'Produto Técnico Industrial',
      'Pré-Mistura Industrial',
      'Fertilizante Mineral / Organomineral',
      'Inoculante / Biológico',
      'Corretivo / Condicionador de Solo',
      'Semente Certificada',
      'Adjuvante / Espalhante Adesivo',
      'Outros Insumos Químicos e Reagentes',
    ]

    function normalizarTipoProduto(tipo, macro, sub) {
      if (tipo && TIPOS_PRODUTO_CANONICOS.includes(tipo)) return tipo
      const s = `${String(tipo || '')} ${String(macro || '')} ${String(sub || '')}`.toUpperCase()
      if (s.includes('TECNICO') || s.includes('TÉCNICO')) return 'Produto Técnico Industrial'
      if (s.includes('PRE-MISTURA') || s.includes('PRÉ-MISTURA')) return 'Pré-Mistura Industrial'
      if (s.includes('FERTILIZANTE') || s.includes('NPK') || s.includes('ORGANOMINERAL'))
        return 'Fertilizante Mineral / Organomineral'
      if (s.includes('INOCULANTE') || s.includes('BIOLOGICO') || s.includes('BIOLÓGICO'))
        return 'Inoculante / Biológico'
      if (
        s.includes('CORRETIVO') ||
        s.includes('CONDICIONADOR') ||
        s.includes('CALCARIO') ||
        s.includes('GESSO')
      )
        return 'Corretivo / Condicionador de Solo'
      if (s.includes('SEMENTE')) return 'Semente Certificada'
      if (s.includes('ADJUVANTE') || s.includes('ESPALHANTE'))
        return 'Adjuvante / Espalhante Adesivo'
      return 'Produto Formulado Comercial'
    }

    const UNIDADES_CANONICAS = ['L', 'KG', 'SC', 'UN', 'DOSES']
    function normalizarUnidade(u, embalagem) {
      if (u) {
        const up = String(u).trim().toUpperCase()
        if (UNIDADES_CANONICAS.includes(up)) return up
        if (up === 'LT' || up === 'LITROS' || up === 'ML') return 'L'
        if (up === 'G' || up === 'KILOS' || up === 'QUILOS' || up === 'TON' || up === 'T')
          return 'KG'
        if (up === 'SACO' || up === 'SACAS') return 'SC'
        if (up === 'FRASCO' || up === 'BOMBONA' || up === 'TAMBOR' || up === 'LATA') return 'UN'
      }
      const embUpper = String(embalagem || '').toUpperCase()
      if (embUpper.includes('KG') || embUpper.includes('QUILO') || embUpper.includes('G'))
        return 'KG'
      if (embUpper.includes('SC') || embUpper.includes('SACO') || embUpper.includes('SACARIA'))
        return 'SC'
      if (embUpper.includes('DOSE')) return 'DOSES'
      if (embUpper.includes('UN') || embUpper.includes('PECA')) return 'UN'
      return 'L'
    }

    // -------------------------------------------------------------------------
    // Helpers de Mapeamento Agnóstico de Colunas para sim_regras_icms
    // -------------------------------------------------------------------------
    const UFS_MAPA_SIGLAS = {
      AC: 'AC',
      ACRE: 'AC',
      AL: 'AL',
      ALAGOAS: 'AL',
      AP: 'AP',
      AMAPA: 'AP',
      AMAPÁ: 'AP',
      AM: 'AM',
      AMAZONAS: 'AM',
      BA: 'BA',
      BAHIA: 'BA',
      CE: 'CE',
      CEARA: 'CE',
      CEARÁ: 'CE',
      DF: 'DF',
      'DISTRITO FEDERAL': 'DF',
      ES: 'ES',
      'ESPIRITO SANTO': 'ES',
      'ESPÍRITO SANTO': 'ES',
      GO: 'GO',
      GOIAS: 'GO',
      GOIÁS: 'GO',
      MA: 'MA',
      MARANHAO: 'MA',
      MARANHÃO: 'MA',
      MT: 'MT',
      'MATO GROSSO': 'MT',
      MS: 'MS',
      'MATO GROSSO DO SUL': 'MS',
      MG: 'MG',
      'MINAS GERAIS': 'MG',
      PA: 'PA',
      PARA: 'PA',
      PARÁ: 'PA',
      PB: 'PB',
      PARAIBA: 'PB',
      PARAÍBA: 'PB',
      PR: 'PR',
      PARANA: 'PR',
      PARANÁ: 'PR',
      PE: 'PE',
      PERNAMBUCO: 'PE',
      PI: 'PI',
      PIAUI: 'PI',
      PIAUÍ: 'PI',
      RJ: 'RJ',
      'RIO DE JANEIRO': 'RJ',
      RN: 'RN',
      'RIO GRANDE DO NORTE': 'RN',
      RS: 'RS',
      'RIO GRANDE DO SUL': 'RS',
      RO: 'RO',
      RONDONIA: 'RO',
      RONDÔNIA: 'RO',
      RR: 'RR',
      RORAIMA: 'RR',
      SC: 'SC',
      'SANTA CATARINA': 'SC',
      SP: 'SP',
      'SAO PAULO': 'SP',
      'SÃO PAULO': 'SP',
      SE: 'SE',
      SERGIPE: 'SE',
      TO: 'TO',
      TOCANTINS: 'TO',
      EX: 'EX',
      EXTERIOR: 'EX',
    }

    function extrairValorPorAliasesHook(obj, aliases) {
      if (!obj || typeof obj !== 'object') return ''
      const keys = Object.keys(obj)

      // 1ª passada: match exato no nome normalizado
      for (let a = 0; a < aliases.length; a++) {
        const normAlias = normTxt(aliases[a])
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k]
          if (normTxt(key) === normAlias && obj[key] !== undefined && obj[key] !== null) {
            const v = String(obj[key]).trim()
            if (v.length > 0) return v
          }
        }
      }

      // 2ª passada: startsWith normalizado
      for (let a = 0; a < aliases.length; a++) {
        const normAlias = normTxt(aliases[a])
        if (normAlias.length < 3) continue
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k]
          const normKey = normTxt(key)
          if (normKey.indexOf(normAlias) === 0 && obj[key] !== undefined && obj[key] !== null) {
            const v = String(obj[key]).trim()
            if (v.length > 0) return v
          }
        }
      }

      // 3ª passada: substring match
      for (let a = 0; a < aliases.length; a++) {
        const normAlias = normTxt(aliases[a])
        if (normAlias.length < 4) continue
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k]
          const normKey = normTxt(key)
          if (normKey.indexOf(normAlias) !== -1 && obj[key] !== undefined && obj[key] !== null) {
            const v = String(obj[key]).trim()
            if (v.length > 0) return v
          }
        }
      }

      return ''
    }

    function normalizarUfHook(raw) {
      if (!raw) return ''
      let str = String(raw).trim().toUpperCase()
      if (!str) return ''
      if (str.length === 2 && UFS_MAPA_SIGLAS[str]) {
        return str
      }
      const semAcentos = str.replace(/[\u0300-\u036f]/g, '').trim()
      if (UFS_MAPA_SIGLAS[semAcentos]) {
        return UFS_MAPA_SIGLAS[semAcentos]
      }
      const m = str.match(/\b([A-Z]{2})\b/)
      if (m && UFS_MAPA_SIGLAS[m[1]]) {
        return m[1]
      }
      return ''
    }

    function normalizarNumeroPercentualHook(raw) {
      if (raw === undefined || raw === null || raw === '') return 0
      if (typeof raw === 'number') {
        if (isNaN(raw)) return 0
        if (raw > 0 && raw < 1) {
          return Math.round(raw * 10000) / 100
        }
        return raw
      }
      let str = String(raw).trim()
      if (!str) return 0
      const hasPercent = str.indexOf('%') !== -1
      str = str.replace(/%/g, '').trim()
      if (str.indexOf('.') !== -1 && str.indexOf(',') !== -1) {
        str = str.replace(/\./g, '').replace(',', '.')
      } else if (str.indexOf(',') !== -1) {
        str = str.replace(',', '.')
      }
      const cleaned = str.replace(/[^\d.-]/g, '')
      const parsed = parseFloat(cleaned)
      if (isNaN(parsed)) return 0
      if (hasPercent || (parsed > 0 && parsed < 1)) {
        if (parsed > 0 && parsed < 1) {
          return Math.round(parsed * 10000) / 100
        }
      }
      return parsed
    }

    // -------------------------------------------------------------------------
    // Execução do Lote com Transação ACID
    // -------------------------------------------------------------------------
    let inseridos = 0
    let atualizados = 0
    let ignorados = 0
    let espelhadosBaseMestre = 0
    const erros = []
    const resumoCategorias = {}

    function extrairDetalhesErroDb(err) {
      let msg = err && err.message ? String(err.message) : String(err || 'Erro desconhecido')
      let campoIdentificado = ''
      let motivoDetalhado = msg

      // Se o PocketBase anexou detalhes de validação (err.data ou objeto com campos)
      if (err && err.data && typeof err.data === 'object') {
        const chaves = Object.keys(err.data)
        if (chaves.length > 0) {
          const partes = []
          for (let k = 0; k < chaves.length; k++) {
            const fKey = chaves[k]
            const fVal = err.data[fKey]
            const fMsg =
              typeof fVal === 'object' && fVal && fVal.message ? fVal.message : String(fVal || '')
            partes.push(`Campo "${fKey}": ${fMsg}`)
            if (!campoIdentificado) campoIdentificado = fKey
          }
          motivoDetalhado = partes.join('; ')
        }
      } else if (msg.includes('validation_')) {
        // Formato comum do Goja/PocketBase quando lança erro de validação
        motivoDetalhado = msg
      }

      return { campo: campoIdentificado, motivo: motivoDetalhado }
    }

    function registrarErro(linhaOriginal, linhaLote, categoria, motivo, campo, valor, dados) {
      const errItem = {
        linhaOriginal: Number(linhaOriginal) || linhaLote,
        linhaLote: linhaLote,
        categoria: String(categoria || 'Erro de Validação'),
        motivo: String(motivo || 'Dado inválido para o banco de dados'),
        campo: campo ? String(campo) : undefined,
        valor: valor !== undefined && valor !== null ? String(valor).slice(0, 200) : undefined,
        dados: dados || {},
      }
      erros.push(errItem)
      resumoCategorias[errItem.categoria] = (resumoCategorias[errItem.categoria] || 0) + 1
    }

    $app.runInTransaction((txApp) => {
      const colTarget = txApp.findCollectionByNameOrId(collectionName)

      // =======================================================================
      // CASO 1: dicionario_principios_ativos (Matriz Canônica de 13 Campos)
      // =======================================================================
      if (collectionName === 'dicionario_principios_ativos') {
        for (let i = 0; i < records.length; i++) {
          const itemWrapper = records[i]
          const data = itemWrapper.data || itemWrapper
          const rowNum = Number(itemWrapper.originalLine) || i + 1

          const chaveBruta = String(data.principio_ativo_chave || data.principio_ativo || '').trim()

          // Validação obrigatória da chave canônica
          if (!chaveBruta) {
            registrarErro(
              rowNum,
              i + 1,
              'Campo Obrigatório Ausente',
              'O campo Princípio Ativo (chave canônica) é obrigatório.',
              'principio_ativo_chave',
              '',
              data,
            )
            continue
          }

          // Se a chave for apenas instruções ou cabeçalho duplicado
          const chaveNorm = normTxt(chaveBruta)
          if (
            chaveNorm === 'principioativo' ||
            chaveNorm === 'ingredienteativo' ||
            chaveNorm === 'molecula' ||
            chaveNorm === 'ativo'
          ) {
            registrarErro(
              rowNum,
              i + 1,
              'Cabeçalho Duplicado',
              `Linha de cabeçalho duplicada ("${chaveBruta}") no corpo da planilha.`,
              'principio_ativo_chave',
              chaveBruta,
              data,
            )
            continue
          }

          const chaveUpper = chaveBruta.toUpperCase()

          // Normalização canônica dos 13 campos
          let nota2 = normalizarNotaSubpos2(data.nota_subpos_2)
          if (verificarNota2Molecula(chaveUpper, data.macro_grupo_subgrupo_padrao)) {
            nota2 = 'SIM'
          }

          let ncmRef = fmtNcmMascara(data.ncm_padrao_referencia)
          if (!ncmRef) {
            ncmRef = nota2 === 'SIM' ? '3808.62.90' : '3808.93.29'
          }

          let ncmF1 =
            fmtNcmMascara(data.ncm_faixa1_ate_300g) || (nota2 === 'SIM' ? '3808.61.00' : ncmRef)
          let ncmF2 = fmtNcmMascara(data.ncm_faixa2_300g_a_7_5kg) || ncmRef
          let ncmF3 = fmtNcmMascara(data.ncm_faixa3_7_5kg_a_10kg) || ncmRef
          let ncmF4 = fmtNcmMascara(data.ncm_faixa4_acima_10kg) || ncmRef
          let ncmGranel =
            fmtNcmMascara(data.ncm_granel_tecnico) ||
            (nota2 === 'SIM' ? '3808.69.90' : '3808.93.19')

          // Higienização e truncamento defensivo para os limites do schema da matriz
          let macroSub =
            String(data.macro_grupo_subgrupo_padrao || '').trim() || 'Defensivos — Herbicida'
          if (macroSub.length > 500) macroSub = macroSub.slice(0, 500)

          let regraTipi =
            String(data.regra_tipi_embalagem || '').trim() ||
            (nota2 === 'SIM'
              ? 'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022)'
              : 'Posição 38.08 TIPI')
          if (regraTipi.length > 500) regraTipi = regraTipi.slice(0, 500)

          let sisMapa =
            String(data.sistema_registro_mapa || '').trim() ||
            'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)'
          if (sisMapa.length > 500) sisMapa = sisMapa.slice(0, 500)

          let pisCofins =
            String(data.enquadramento_pis_cofins || '').trim() ||
            'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real pós-Abr/26'
          if (pisCofins.length > 500) pisCofins = pisCofins.slice(0, 500)

          let cstRec =
            String(data.cst_recomendado || '').trim() ||
            'Saída: CST 06 (c/ Ajuste M220/M620) | Entrada: CST 73'
          if (cstRec.length > 500) cstRec = cstRec.slice(0, 500)

          // Chave do P.A. (máx 255)
          const chaveTruncada = chaveUpper.length > 255 ? chaveUpper.slice(0, 255) : chaveUpper

          // NCMs (máx 10)
          const ncmRefTrunc = ncmRef.length > 10 ? ncmRef.slice(0, 10) : ncmRef
          const ncmF1Trunc = ncmF1.length > 10 ? ncmF1.slice(0, 10) : ncmF1
          const ncmF2Trunc = ncmF2.length > 10 ? ncmF2.slice(0, 10) : ncmF2
          const ncmF3Trunc = ncmF3.length > 10 ? ncmF3.slice(0, 10) : ncmF3
          const ncmF4Trunc = ncmF4.length > 10 ? ncmF4.slice(0, 10) : ncmF4
          const ncmGranelTrunc = ncmGranel.length > 10 ? ncmGranel.slice(0, 10) : ncmGranel

          // Localizar se já existe para fazer Upsert idempotente
          const escChave = chaveTruncada.replace(/'/g, "\\'")
          const existentes =
            txApp.findRecordsByFilter(
              'dicionario_principios_ativos',
              `principio_ativo_chave = '${escChave}' || principio_ativo = '${escChave}'`,
              '-created',
              1,
              0,
            ) || []

          let record = null
          let isUpdate = false

          if (existentes.length > 0) {
            record = existentes[0]
            isUpdate = true
          } else {
            record = new Record(colTarget)
          }

          record.set('principio_ativo_chave', chaveTruncada)
          record.set('principio_ativo', chaveTruncada)
          record.set('macro_grupo_subgrupo_padrao', macroSub)
          record.set('nota_subpos_2', nota2)
          record.set('ncm_padrao_referencia', ncmRefTrunc)
          record.set('ncm_faixa1_ate_300g', ncmF1Trunc)
          record.set('ncm_faixa2_300g_a_7_5kg', ncmF2Trunc)
          record.set('ncm_faixa3_7_5kg_a_10kg', ncmF3Trunc)
          record.set('ncm_faixa4_acima_10kg', ncmF4Trunc)
          record.set('ncm_granel_tecnico', ncmGranelTrunc)
          record.set('regra_tipi_embalagem', regraTipi)
          record.set('sistema_registro_mapa', sisMapa)
          record.set('enquadramento_pis_cofins', pisCofins)
          record.set('cst_recomendado', cstRec)

          // Legado
          const classeExtraida = macroSub.includes('—')
            ? macroSub.split('—')[1].trim()
            : macroSub.includes('-')
              ? macroSub.split('-')[1].trim()
              : 'Defensivos'
          record.set('classe', String(data.classe || classeExtraida).trim())
          record.set('grupo_quimico', String(data.grupo_quimico || 'Importação Matriz').trim())
          record.set('concentracao_min', Number(data.concentracao_min) || 0)
          record.set('concentracao_max', Number(data.concentracao_max) || 0)
          record.set('unidade', String(data.unidade || '%').trim() || '%')
          record.set('status', String(data.status || 'Ativo').trim() || 'Ativo')

          try {
            txApp.save(record)
            if (isUpdate) {
              atualizados++
              ignorados++ // Mantém semântica de duplicado resolvido / já existente
            } else {
              inseridos++
            }
          } catch (err) {
            const detalhe = extrairDetalhesErroDb(err)
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar registro: ${detalhe.motivo}`,
              detalhe.campo || 'principio_ativo_chave',
              chaveUpper,
              data,
            )
          }
        }
      }

      // =======================================================================
      // CASO 2: base_mestre (Catálogo Canônico de 28 Campos)
      // =======================================================================
      else if (collectionName === 'base_mestre') {
        const colPa = txApp.findCollectionByNameOrId('dicionario_principios_ativos')

        for (let i = 0; i < records.length; i++) {
          const itemWrapper = records[i]
          const data = itemWrapper.data || itemWrapper
          const rowNum = Number(itemWrapper.originalLine) || i + 1

          const nomeCompleto = String(
            data.nome_completo || data.nome_produto || data.descricao || '',
          ).trim()

          // Validação de nome obrigatório
          if (!nomeCompleto || /^\d+$/.test(nomeCompleto)) {
            registrarErro(
              rowNum,
              i + 1,
              /^\d+$/.test(nomeCompleto)
                ? 'Descrição Numérica (Linha de Tabela)'
                : 'Campo Obrigatório Ausente',
              nomeCompleto
                ? `Descrição "${nomeCompleto}" é puramente numérica. Nome de produto válido é obrigatório.`
                : 'Nome ou descrição do produto é obrigatório.',
              'nome_produto',
              nomeCompleto || 'vazio',
              data,
            )
            continue
          }

          const marcaPadronizada =
            String(data.marca_padronizada || '').trim() || sanitizarMarca(nomeCompleto)
          const embLimpa = String(data.embalagem || '1X20L (20 L)').trim()
          const unidadeFinal = normalizarUnidade(data.unidade, embLimpa)
          const macroFinal = String(data.macro_grupo || 'Defensivos').trim()
          const subFinal = String(data.sub_grupo || 'Herbicida').trim()
          const tipoFinal = normalizarTipoProduto(data.tipo_produto, macroFinal, subFinal)
          const regMapaFormatado = sanitizarMapa(data.registro_mapa)

          // Higienização defensiva de titular_fabricante / fabricante:
          // Trunca no limite real (500) preservando o início do texto onde reside o nome do titular
          let titularFinal =
            String(data.titular_fabricante || data.fabricante || 'Não Informado').trim() ||
            'Não Informado'
          if (titularFinal.length > 500) {
            titularFinal = titularFinal.slice(0, 500)
          }

          const paDeclarado = String(data.principio_ativo || marcaPadronizada).trim()
          let nota2 = normalizarNotaSubpos2(data.nota_subpos_2)
          if (verificarNota2Molecula(paDeclarado, nomeCompleto)) {
            nota2 = 'SIM'
          }

          // NCM obrigatório: se ausente ou incompleto, tentar dedução pelo motor químico-aduaneiro antes de recusar
          let rawNcm = String(data.ncm_padrao || data.ncm || '').trim()
          let digitsNcm = rawNcm.replace(/\D/g, '')

          if (!digitsNcm || digitsNcm.length !== 8) {
            // Tentativa de dedução determinística se possui princípio ativo ou tipo industrial/técnico
            const paUpper = paDeclarado.toUpperCase()
            const isTecnico =
              tipoFinal === 'Produto Técnico Industrial' ||
              paUpper.includes('TECNICO') ||
              paUpper.includes('TÉCNICO') ||
              regMapaFormatado.startsWith('TC') ||
              nomeCompleto.toUpperCase().includes('TECNICO') ||
              nomeCompleto.toUpperCase().includes('TÉCNICO')

            let deduzido = ''

            // 1. Verificar se o princípio ativo já tem NCM padrão ou granel na matriz dicionario_principios_ativos
            if (paDeclarado) {
              const escPa = paUpper.replace(/'/g, "\\'")
              const paRows =
                txApp.findRecordsByFilter(
                  'dicionario_principios_ativos',
                  `principio_ativo_chave = '${escPa}' || principio_ativo = '${escPa}'`,
                  '-created',
                  1,
                  0,
                ) || []
              if (paRows.length > 0) {
                const rowPa = paRows[0]
                const ncmMatriz = isTecnico
                  ? rowPa.getString('ncm_granel_tecnico') ||
                    rowPa.getString('ncm_padrao_referencia')
                  : rowPa.getString('ncm_padrao_referencia') ||
                    rowPa.getString('ncm_granel_tecnico')
                const d = String(ncmMatriz || '').replace(/\D/g, '')
                if (d.length === 8) deduzido = d
              }
            }

            // 2. Se não encontrou na matriz, rodar motor canônico químico-aduaneiro
            if (!deduzido) {
              if (nota2 === 'SIM') {
                deduzido = isTecnico ? '38086990' : '38086290'
              } else if (tipoFinal === 'Fertilizante Mineral / Organomineral') {
                deduzido = '31059090'
              } else if (tipoFinal === 'Corretivo / Condicionador de Solo') {
                deduzido = paUpper.includes('GESSO') ? '25201019' : '25210000'
              } else if (tipoFinal === 'Inoculante / Biológico') {
                deduzido = '30024999'
              } else if (tipoFinal === 'Adjuvante / Espalhante Adesivo') {
                deduzido = '38249989'
              } else if (isTecnico) {
                if (subFinal.includes('Fungicida') || paUpper.includes('FUNGICIDA')) {
                  deduzido = '38089220'
                } else if (subFinal.includes('Inseticida') || paUpper.includes('INSETICIDA')) {
                  deduzido = '38089120'
                } else {
                  deduzido = '38089319' // Herbicida técnico
                }
              } else {
                // Formulado comercial
                if (subFinal.includes('Fungicida') || paUpper.includes('FUNGICIDA')) {
                  deduzido = paUpper.includes('MANCOZEB') ? '38089293' : '38089299'
                } else if (subFinal.includes('Inseticida') || paUpper.includes('INSETICIDA')) {
                  deduzido =
                    paUpper.includes('ACEFATO') || paUpper.includes('THURINGIENSIS')
                      ? '38089191'
                      : paUpper.includes('CIPERMETRINA')
                        ? '38089192'
                        : '38089199'
                } else if (subFinal.includes('Regulador') || paUpper.includes('REGULADOR')) {
                  deduzido = '38089359'
                } else if (subFinal.includes('Nematicida') || paUpper.includes('NEMATICIDA')) {
                  deduzido = '38089995'
                } else {
                  if (
                    paUpper.includes('2,4-D') ||
                    paUpper.includes('2-4 D') ||
                    paUpper.includes('MCPA')
                  ) {
                    deduzido = '38089322'
                  } else if (paUpper.includes('ATRAZINA') || paUpper.includes('DIURON')) {
                    deduzido = '38089323'
                  } else if (paUpper.includes('GLIFOSATO') || paUpper.includes('GLYPHOSATE')) {
                    deduzido = '38089324'
                  } else if (
                    paUpper.includes('IMAZETAPIR') ||
                    paUpper.includes('CLORIMURON') ||
                    paUpper.includes('METSULFURON') ||
                    paUpper.includes('NICOSULFURON')
                  ) {
                    deduzido = '38089327'
                  } else if (
                    paUpper.includes('AMETRINA') ||
                    paUpper.includes('HEXAZINONA') ||
                    paUpper.includes('METRIBUZIM') ||
                    paUpper.includes('METRIBUZIN')
                  ) {
                    deduzido = '38089328'
                  } else {
                    deduzido = '38089329'
                  }
                }
              }
            }

            if (deduzido && deduzido.length === 8) {
              digitsNcm = deduzido
              rawNcm = fmtNcmMascara(deduzido)
            } else {
              registrarErro(
                rowNum,
                i + 1,
                digitsNcm ? 'NCM com Dígitos Inválidos' : 'NCM Ausente',
                digitsNcm
                  ? `Código NCM "${rawNcm}" possui ${digitsNcm.length} dígitos. O padrão TIPI exige 8 dígitos numéricos.`
                  : 'NCM do produto é obrigatório (tentativa de dedução canônica sem correspondência taxativa).',
                'ncm',
                rawNcm || 'vazio',
                data,
              )
              continue
            }
          }

          const ncmMascara = fmtNcmMascara(digitsNcm)

          // Resolução do Princípio Ativo na Matriz (FK principio_ativo_id) garantindo Dual-Sync sem órfãos
          let paRecordId = String(data.principio_ativo_id || '').trim()
          if (!paRecordId && paDeclarado) {
            const paUpper = paDeclarado.toUpperCase()
            const escPa = paUpper.replace(/'/g, "\\'")
            const paEncontrados =
              txApp.findRecordsByFilter(
                'dicionario_principios_ativos',
                `principio_ativo_chave = '${escPa}' || principio_ativo = '${escPa}'`,
                '-created',
                1,
                0,
              ) || []

            if (paEncontrados.length > 0) {
              paRecordId = paEncontrados[0].id
            } else {
              // Criação automática atômica na matriz
              try {
                const novoPa = new Record(colPa)
                novoPa.set('principio_ativo_chave', paUpper)
                novoPa.set('principio_ativo', paUpper)
                novoPa.set('macro_grupo_subgrupo_padrao', `${macroFinal} — ${subFinal}`)
                novoPa.set('nota_subpos_2', nota2)
                novoPa.set('ncm_padrao_referencia', ncmMascara)
                novoPa.set('ncm_faixa1_ate_300g', nota2 === 'SIM' ? '3808.61.00' : ncmMascara)
                novoPa.set('ncm_faixa2_300g_a_7_5kg', ncmMascara)
                novoPa.set('ncm_faixa3_7_5kg_a_10kg', ncmMascara)
                novoPa.set('ncm_faixa4_acima_10kg', ncmMascara)
                novoPa.set('ncm_granel_tecnico', ncmMascara)
                novoPa.set(
                  'regra_tipi_embalagem',
                  nota2 === 'SIM'
                    ? 'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022)'
                    : 'Posição 38.08 TIPI',
                )
                novoPa.set(
                  'sistema_registro_mapa',
                  regMapaFormatado.includes('-')
                    ? 'SIPEAGRO/MAPA'
                    : 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)',
                )
                novoPa.set(
                  'enquadramento_pis_cofins',
                  'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real pós-Abr/26',
                )
                novoPa.set(
                  'cst_recomendado',
                  'Saída: CST 06 (c/ Ajuste M220/M620) | Entrada: CST 73',
                )
                novoPa.set('classe', subFinal)
                novoPa.set('grupo_quimico', 'Auto-Ingestão Dual-Sync')
                novoPa.set('status', 'Ativo')
                txApp.save(novoPa)
                paRecordId = novoPa.id
              } catch (_) {
                /* continua mesmo se não puder criar o PA */
              }
            }
          }

          // Checagem de Duplicidade (Trava 4) para Upsert Idempotente
          const mapaDigits = regMapaFormatado.replace(/\D/g, '')
          const marcaNorm = normTxt(marcaPadronizada)
          const escMarcaNorm = marcaPadronizada.replace(/'/g, "\\'")

          let matchRecord = null

          // Critério A: Registro MAPA válido
          if (mapaDigits && mapaDigits.length >= 4) {
            const escMapa = regMapaFormatado.replace(/'/g, "\\'")
            const porMapa =
              txApp.findRecordsByFilter(
                'base_mestre',
                `registro_mapa = '${escMapa}'`,
                '-created',
                1,
                0,
              ) || []
            if (porMapa.length > 0) {
              matchRecord = porMapa[0]
            }
          }

          // Critério B: Marca padronizada + NCM
          if (!matchRecord && marcaNorm) {
            const porMarcaNcm =
              txApp.findRecordsByFilter(
                'base_mestre',
                `(marca_padronizada = '${escMarcaNorm}' || nome_produto = '${escMarcaNorm}') && (ncm = '${digitsNcm}' || ncm_padrao = '${ncmMascara}')`,
                '-created',
                1,
                0,
              ) || []
            if (porMarcaNcm.length > 0) {
              matchRecord = porMarcaNcm[0]
            }
          }

          let recBase = null
          let isUpdate = false

          if (matchRecord) {
            recBase = matchRecord
            isUpdate = true
          } else {
            recBase = new Record(colTarget)
          }

          // 28 Campos Canônicos
          recBase.set('nome_completo', nomeCompleto)
          recBase.set('marca_padronizada', marcaPadronizada)
          recBase.set('tipo_produto', tipoFinal)
          recBase.set('embalagem', embLimpa)
          recBase.set('unidade', unidadeFinal)
          recBase.set('principio_ativo', paDeclarado)
          recBase.set('macro_grupo', macroFinal)
          recBase.set('sub_grupo', subFinal)
          recBase.set('nota_subpos_2', nota2)
          recBase.set('ncm_padrao', ncmMascara)
          recBase.set(
            'ncm_faixa1_ate_300g',
            fmtNcmMascara(data.ncm_faixa1_ate_300g) ||
              (nota2 === 'SIM' ? '3808.61.00' : ncmMascara),
          )
          recBase.set(
            'ncm_faixa2_300g_a_7_5kg',
            fmtNcmMascara(data.ncm_faixa2_300g_a_7_5kg) || ncmMascara,
          )
          recBase.set(
            'ncm_faixa3_7_5kg_a_10kg',
            fmtNcmMascara(data.ncm_faixa3_7_5kg_a_10kg) || ncmMascara,
          )
          recBase.set(
            'ncm_faixa4_acima_10kg',
            fmtNcmMascara(data.ncm_faixa4_acima_10kg) || ncmMascara,
          )
          recBase.set(
            'regra_tipi',
            String(data.regra_tipi || '').trim() ||
              (nota2 === 'SIM'
                ? 'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022)'
                : 'Posição 38.08 TIPI'),
          )
          recBase.set('registro_mapa', regMapaFormatado)
          recBase.set(
            'sistema_norma_mapa',
            String(data.sistema_norma_mapa || '').trim() ||
              (regMapaFormatado.includes('-')
                ? 'SIPEAGRO/MAPA (IN 39/2018 ou IN 35/2006)'
                : 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)'),
          )
          recBase.set('titular_fabricante', titularFinal)
          recBase.set('origem_base', String(data.origem_base || 'PLANILHA_IMPORTACAO').trim())
          recBase.set(
            'status_pis_cofins',
            String(data.status_pis_cofins || '').trim() ||
              'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
          )
          recBase.set(
            'aliquota_ate_mar2026',
            String(data.aliquota_ate_mar2026 || '0,00% (Lei nº 10.925/2004)').trim(),
          )
          recBase.set(
            'aliquota_pos_abr2026_real',
            String(data.aliquota_pos_abr2026_real || '0,925% (LC nº 224/2025)').trim(),
          )
          recBase.set(
            'aliquota_pos_abr2026_presumido',
            String(data.aliquota_pos_abr2026_presumido || '0,365% (LC nº 224/2025)').trim(),
          )
          recBase.set('cst_saida', String(data.cst_saida || 'CST 06').trim())
          recBase.set('cst_entrada', String(data.cst_entrada || 'CST 73').trim())
          recBase.set(
            'ibs_cbs_2027',
            String(data.ibs_cbs_2027 || 'Redução de 60% + Diferimento').trim(),
          )
          recBase.set(
            'url_oficial',
            String(data.url_oficial || 'https://dados.agricultura.gov.br').trim(),
          )

          if (paRecordId) {
            recBase.set('principio_ativo_id', paRecordId)
          }

          // Compatibilidade legado
          recBase.set('nome_produto', marcaPadronizada)
          recBase.set('ncm', digitsNcm)
          recBase.set('fabricante', titularFinal)
          recBase.set('concentracao', Number(data.concentracao) || 0)
          recBase.set('unidade_concentracao', unidadeFinal)
          recBase.set('status_validacao', 'aprovado')

          try {
            txApp.save(recBase)
            if (isUpdate) {
              atualizados++
              ignorados++
            } else {
              inseridos++
            }
          } catch (err) {
            const detalhe = extrairDetalhesErroDb(err)
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar produto na Base Mestre: ${detalhe.motivo}`,
              detalhe.campo || 'nome_produto',
              nomeCompleto,
              data,
            )
          }
        }
      }

      // =======================================================================
      // CASO 3: regras_ncm_embalagem
      // =======================================================================
      else if (collectionName === 'regras_ncm_embalagem') {
        for (let i = 0; i < records.length; i++) {
          const itemWrapper = records[i]
          const data = itemWrapper.data || itemWrapper
          const rowNum = Number(itemWrapper.originalLine) || i + 1

          const rawNcm = String(data.ncm || '').trim()
          const digits = rawNcm.replace(/\D/g, '')

          if (!digits || digits.length !== 8) {
            registrarErro(
              rowNum,
              i + 1,
              digits ? 'NCM com Dígitos Inválidos' : 'NCM Ausente',
              digits
                ? `Código NCM "${rawNcm}" possui ${digits.length} dígitos. O padrão TIPI exige 8 dígitos numéricos.`
                : 'Código NCM é obrigatório.',
              'ncm',
              rawNcm || 'vazio',
              data,
            )
            continue
          }

          // Upsert por NCM
          const existentes =
            txApp.findRecordsByFilter(
              'regras_ncm_embalagem',
              `ncm = '${digits}'`,
              '-created',
              1,
              0,
            ) || []

          let rec = null
          let isUpdate = false
          if (existentes.length > 0) {
            rec = existentes[0]
            isUpdate = true
          } else {
            rec = new Record(colTarget)
          }

          rec.set('ncm', digits)
          rec.set('descricao', String(data.descricao || `NCM ${digits}`).trim())
          const embalagens = Array.isArray(data.embalagens_permitidas)
            ? data.embalagens_permitidas
            : []
          rec.set('embalagens_permitidas', JSON.stringify(embalagens))
          if (data.regra_especial) {
            rec.set('regra_especial', String(data.regra_especial).trim())
          }

          try {
            txApp.save(rec)
            if (isUpdate) {
              atualizados++
              ignorados++
            } else {
              inseridos++
            }
          } catch (err) {
            const detalhe = extrairDetalhesErroDb(err)
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar regra de NCM: ${detalhe.motivo}`,
              detalhe.campo || 'ncm',
              digits,
              data,
            )
          }
        }
      }

      // =======================================================================
      // CASO 4: bula_produtos (Sheet 1: Cadastro_Mestre_1a1)
      // Importação na íntegra SEM REGRAS DE RECUSA/DESCARTES.
      // Chave de idempotência por produto/SKU: (registro_mapa + codigo / ID Produto),
      // com fallback para (registro_mapa + nome_comercial) quando o código vier vazio.
      // Garante que cada linha/SKU distinto seja INSERIDO sem fusão indevida.
      // =======================================================================
      else if (collectionName === 'bula_produtos') {
        for (let i = 0; i < records.length; i++) {
          const itemWrapper = records[i]
          const data = itemWrapper.data || itemWrapper
          const rowNum = Number(itemWrapper.originalLine) || i + 1

          const regMapaRaw = String(data.registro_mapa || '').trim()
          const nomeComercial = String(data.nome_comercial || data.nome_produto || '').trim()
          const codigoProd = String(data.codigo || '').trim()

          // Normalização tolerante do registro MAPA (sem recusa caso venha vazio)
          const regMapa = regMapaRaw ? sanitizarMapa(regMapaRaw) : `LINHA-${rowNum}`
          const escMapa = regMapa.replace(/'/g, "\\'")
          const escCodigo = codigoProd.replace(/'/g, "\\'")
          const escNome = nomeComercial.replace(/'/g, "\\'")

          // Upsert idempotente composto:
          // 1. Prioridade: registro_mapa + codigo (ID Produto da planilha)
          // 2. Fallback: registro_mapa + nome_comercial se código não foi informado
          let filtroProd = ''
          if (escCodigo) {
            filtroProd = `registro_mapa = '${escMapa}' && codigo = '${escCodigo}'`
          } else if (escNome) {
            filtroProd = `registro_mapa = '${escMapa}' && nome_comercial = '${escNome}'`
          } else {
            filtroProd = `registro_mapa = '${escMapa}'`
          }

          const existentes =
            txApp.findRecordsByFilter('bula_produtos', filtroProd, '-created', 1, 0) || []

          let rec = null
          let isUpdate = false
          if (existentes.length > 0) {
            rec = existentes[0]
            isUpdate = true
          } else {
            rec = new Record(colTarget)
          }

          // Truncamento defensivo e preservação integral em dados_extras
          const titularBruto = String(data.titular_registro || data.fabricante || '').trim()
          const fabricanteBruto = String(data.fabricante_formulador || '').trim()
          let paBruto = String(data.principio_ativo || '').trim()
          const modoAcaoBruto = String(data.modo_acao || '').trim()

          // Preenchimento automático de principio_ativo caso venha vazio na linha da planilha:
          // 1. Tenta buscar em bula_composicao pelo mesmo registro_mapa e/ou codigo (ID Produto Base)
          // 2. Se não encontrar, tenta buscar em base_mestre pelo registro_mapa ou marca
          if (!paBruto) {
            try {
              let composicoesMatch = []
              if (escCodigo) {
                composicoesMatch =
                  txApp.findRecordsByFilter(
                    'bula_composicao',
                    `registro_mapa = '${escMapa}' && codigo = '${escCodigo}'`,
                    'id',
                    50,
                    0,
                  ) || []
              }
              if (composicoesMatch.length === 0) {
                composicoesMatch =
                  txApp.findRecordsByFilter(
                    'bula_composicao',
                    `registro_mapa = '${escMapa}'`,
                    'id',
                    50,
                    0,
                  ) || []
              }

              const pasComposicao = []
              for (let ci = 0; ci < composicoesMatch.length; ci++) {
                const cRec = composicoesMatch[ci]
                const iaNome = String(cRec.getString('ingrediente_ativo') || '').trim()
                const func = String(cRec.getString('funcao_ingrediente') || '').toUpperCase()
                if (
                  iaNome &&
                  !func.includes('INERTE') &&
                  !func.includes('EXCIPIENTE') &&
                  !func.includes('OUTROS INGREDIENTES') &&
                  !pasComposicao.includes(iaNome)
                ) {
                  pasComposicao.push(iaNome)
                }
              }

              if (pasComposicao.length > 0) {
                paBruto = pasComposicao.join(' + ')
              } else {
                // Tentar base_mestre
                const mestreMatch =
                  txApp.findRecordsByFilter(
                    'base_mestre',
                    `registro_mapa = '${escMapa}'`,
                    '-created',
                    1,
                    0,
                  ) || []
                if (mestreMatch.length > 0) {
                  const mPa = String(mestreMatch[0].getString('principio_ativo') || '').trim()
                  if (mPa) paBruto = mPa
                }
              }
            } catch (_) {
              // Silencioso em caso de erro na busca correlacionada
            }
          }

          // Preserva valores integrais no JSON de dados_extras
          let extrasObj = {}
          if (data.dados_extras) {
            try {
              extrasObj =
                typeof data.dados_extras === 'string'
                  ? JSON.parse(data.dados_extras)
                  : Object.assign({}, data.dados_extras)
            } catch (_) {
              extrasObj = {}
            }
          }
          if (titularBruto) {
            extrasObj['Titular do Registro (texto completo da planilha)'] = titularBruto
          }
          if (fabricanteBruto) {
            extrasObj['Fabricante/Formulador (texto completo da planilha)'] = fabricanteBruto
          }
          if (paBruto) {
            extrasObj['Princípio Ativo (texto completo da planilha)'] = paBruto
          }

          // Trunca defensivamente para caber no schema caso exceda 4900 caracteres (evita falha física no DB)
          const titularFinal =
            titularBruto.length > 4900 ? titularBruto.slice(0, 4900) + '...' : titularBruto
          const fabricanteFinal =
            fabricanteBruto.length > 4900 ? fabricanteBruto.slice(0, 4900) + '...' : fabricanteBruto
          const paFinal = paBruto.length > 1950 ? paBruto.slice(0, 1950) + '...' : paBruto
          const modoAcaoFinal =
            modoAcaoBruto.length > 1950 ? modoAcaoBruto.slice(0, 1950) + '...' : modoAcaoBruto
          const nomeFinal =
            nomeComercial || rec.getString('nome_comercial') || regMapa || `Produto Linha ${rowNum}`

          // Se for UPDATE (mesmo registro MAPA repetido na planilha ou já gravado):
          // SEMPRE atualiza e enriquece com as informações mais recentes ou faltantes.
          if (isUpdate) {
            if (nomeFinal) {
              rec.set('nome_comercial', nomeFinal)
              rec.set(
                'marca_padronizada',
                String(data.marca_padronizada || sanitizarMarca(nomeFinal)).trim(),
              )
            }
            if (titularFinal) rec.set('titular_registro', titularFinal)
            if (fabricanteFinal) rec.set('fabricante_formulador', fabricanteFinal)
            if (paFinal) rec.set('principio_ativo', paFinal)
            if (data.classe_agronomica)
              rec.set('classe_agronomica', String(data.classe_agronomica).trim())
            if (data.grupo_quimico) rec.set('grupo_quimico', String(data.grupo_quimico).trim())
            if (data.classificacao_toxicologica)
              rec.set('classificacao_toxicologica', String(data.classificacao_toxicologica).trim())
            if (data.classificacao_ambiental)
              rec.set('classificacao_ambiental', String(data.classificacao_ambiental).trim())
            if (data.tipo_formulacao)
              rec.set('tipo_formulacao', String(data.tipo_formulacao).trim())
            if (modoAcaoFinal) rec.set('modo_acao', modoAcaoFinal)
            if (data.tipo_produto) rec.set('tipo_produto', String(data.tipo_produto).trim())
            if (data.status_registro)
              rec.set('status_registro', String(data.status_registro).trim())
            if (data.codigo) rec.set('codigo', String(data.codigo).trim())
            if (data.pa_oficial_correto)
              rec.set('pa_oficial_correto', String(data.pa_oficial_correto).trim())
            if (data.mapa_oficial_limpo)
              rec.set('mapa_oficial_limpo', String(data.mapa_oficial_limpo).trim())
            if (data.embalagem) rec.set('embalagem', String(data.embalagem).trim())
            if (data.url_oficial) rec.set('url_oficial', String(data.url_oficial).trim())
            if (data.macro_grupo) rec.set('macro_grupo', String(data.macro_grupo).trim())
            if (data.sub_grupo) rec.set('sub_grupo', String(data.sub_grupo).trim())
            if (data.nota_subpos_2) rec.set('nota_subpos_2', String(data.nota_subpos_2).trim())
            if (data.regra_tipi) rec.set('regra_tipi', String(data.regra_tipi).trim())
          } else {
            // Novo registro (INSERT)
            rec.set('registro_mapa', regMapa)
            rec.set('nome_comercial', nomeFinal)
            rec.set(
              'marca_padronizada',
              String(data.marca_padronizada || sanitizarMarca(nomeFinal)).trim(),
            )
            rec.set('titular_registro', titularFinal)
            rec.set('fabricante_formulador', fabricanteFinal)
            rec.set('principio_ativo', paFinal)
            rec.set('classe_agronomica', String(data.classe_agronomica || '').trim())
            rec.set('grupo_quimico', String(data.grupo_quimico || '').trim())
            rec.set(
              'classificacao_toxicologica',
              String(data.classificacao_toxicologica || '').trim(),
            )
            rec.set('classificacao_ambiental', String(data.classificacao_ambiental || '').trim())
            rec.set('tipo_formulacao', String(data.tipo_formulacao || '').trim())
            rec.set('modo_acao', modoAcaoFinal)
            rec.set(
              'tipo_produto',
              String(data.tipo_produto || 'Produto Formulado Comercial').trim(),
            )
            rec.set('status_registro', String(data.status_registro || 'Ativo').trim())
            rec.set('codigo', String(data.codigo || '').trim())
            rec.set('pa_oficial_correto', String(data.pa_oficial_correto || '').trim())
            rec.set('mapa_oficial_limpo', String(data.mapa_oficial_limpo || '').trim())
            rec.set('embalagem', String(data.embalagem || '').trim())
            rec.set('url_oficial', String(data.url_oficial || '').trim())
            rec.set('macro_grupo', String(data.macro_grupo || '').trim())
            rec.set('sub_grupo', String(data.sub_grupo || '').trim())
            rec.set('nota_subpos_2', String(data.nota_subpos_2 || '').trim())
            rec.set('regra_tipi', String(data.regra_tipi || '').trim())
          }

          if (Object.keys(extrasObj).length > 0) {
            rec.set('dados_extras', JSON.stringify(extrasObj))
          }

          try {
            txApp.save(rec)
            if (isUpdate) {
              atualizados++
            } else {
              inseridos++
            }
          } catch (err) {
            const detalhe = extrairDetalhesErroDb(err)
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar produto de bula: ${detalhe.motivo}`,
              detalhe.campo || 'registro_mapa',
              regMapa,
              data,
            )
          }

          // REFORMULAÇÃO BASE MESTRE: UM registro por EMBALAGEM COMERCIAL (SKU Final)
          // Granularidade: registro_mapa + quantidade_embalagem_principal + unidade + forma_acondicionamento
          // A NCM é fiel e resolvida para a embalagem comercial.
          try {
            const colBaseMestre = txApp.findCollectionByNameOrId('base_mestre')

            const MOLECULAS_NOTA_2 = [
              'BIFENTRINA',
              'LAMBDA-CIALOTRINA',
              'LAMBDA CIALOTRINA',
              'CLORFENAPIR',
              'CHLORFENAPYR',
              'MALATIONA',
              'MALATHION',
              'FENITROTIONA',
              'BETA-CIFLUTRINA',
              'BETA CIFLUTRINA',
              'CIFLUTRINA',
              'ALFA-CIPERMETRINA',
              'ALFA CIPERMETRINA',
              'ALPHA-CYPERMETHRIN',
              'DELTAMETRINA',
              'PERMETRINA',
              'PROPOXUR',
              'BENDIOCARBE',
              'BENDIOCARB',
            ]

            const paTexto = String(paFinal || '').toUpperCase()
            const isNota2 = MOLECULAS_NOTA_2.some((mol) => paTexto.includes(mol))
            const nota2Val = isNota2
              ? 'SIM'
              : data.nota_subpos_2
                ? String(data.nota_subpos_2).trim()
                : 'NÃO'

            const marcaPad = String(data.marca_padronizada || sanitizarMarca(nomeFinal)).trim()
            const escMarcaPad = marcaPad.replace(/'/g, "\\'")

            // Parser da embalagem comercial: quantidade principal + unidade + acondicionamento
            const embTexto = String(data.embalagem || '1X20L (20 L)').trim()
            const embUpper = embTexto.toUpperCase()

            let qtdPrinc = 20
            let unPrinc = 'L'
            const mMultiplo = embUpper.match(
              /(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(KG|KGS|KILOS?|QUILOS?|L\b|LT|LITROS?|ML)/,
            )
            if (mMultiplo) {
              qtdPrinc = parseFloat(mMultiplo[2].replace(',', '.'))
              const u = mMultiplo[3]
              unPrinc =
                u.startsWith('KG') || u.startsWith('QUILO') || u.startsWith('KILO') ? 'KG' : 'L'
            } else {
              const mDireto = embUpper.match(
                /(\d+(?:[.,]\d+)?)\s*(KG|KGS|KILOS?|QUILOS?|G\b|L\b|LT|LITROS?|ML)\b/,
              )
              if (mDireto) {
                let q = parseFloat(mDireto[1].replace(',', '.'))
                const u = mDireto[2]
                let fat = 1
                if (u === 'G' || u === 'ML') fat = 0.001
                qtdPrinc = q * fat
                unPrinc =
                  u.startsWith('KG') || u.startsWith('QUILO') || u.startsWith('KILO') || u === 'G'
                    ? 'KG'
                    : 'L'
              }
            }

            // Forma de acondicionamento
            let acond = 'Bombona'
            if (embUpper.includes('SACO') || embUpper.includes('SACARIA')) acond = 'Saco'
            else if (embUpper.includes('BIG BAG') || embUpper.includes('BIG-BAG')) acond = 'Big Bag'
            else if (embUpper.includes('TAMBOR')) acond = 'Tambor'
            else if (embUpper.includes('GALÃO') || embUpper.includes('GALAO')) acond = 'Galão'
            else if (embUpper.includes('BALDE')) acond = 'Balde'
            else if (embUpper.includes('FRASCO')) acond = 'Frasco'
            else if (embUpper.includes('CONTAINER') || embUpper.includes('IBC'))
              acond = 'Container / IBC'
            else {
              if (unPrinc === 'KG') acond = qtdPrinc > 25 ? 'Big Bag' : 'Saco'
              else {
                if (qtdPrinc <= 1) acond = 'Frasco'
                else if (qtdPrinc <= 5) acond = 'Galão'
                else if (qtdPrinc <= 50) acond = 'Bombona'
                else if (qtdPrinc <= 250) acond = 'Tambor'
                else acond = 'Container / IBC'
              }
            }

            // Resolução fiel da NCM específica da embalagem comercial
            const isRoundupWg =
              regMapa.includes('002094') ||
              marcaPad.toUpperCase().includes('ROUNDUP WG') ||
              nomeFinal.toUpperCase().includes('ROUNDUP WG') ||
              (String(paFinal || '')
                .toUpperCase()
                .includes('GLIFOSATO') &&
                marcaPad.toUpperCase().includes('ROUNDUP'))

            let ncmEsp = data.ncm_especifica || data.ncm_padrao || data.ncm
            if (isRoundupWg) {
              ncmEsp = '3808.93.24'
            } else if (isNota2) {
              if (qtdPrinc <= 0.3) ncmEsp = '3808.61.00'
              else if (qtdPrinc <= 7.5) ncmEsp = '3808.62.90'
              else ncmEsp = '3808.69.90'
            } else if (!ncmEsp) {
              ncmEsp = data.ncm_padrao || data.ncm || ''
            }

            const ncmMascara = fmtNcmMascara(ncmEsp)
            const ncmLimpo = ncmMascara.replace(/\D/g, '')

            // Chave natural idempotente do registro: MAPA + Quantidade principal + Unidade + Acondicionamento
            const escAcond = acond.replace(/'/g, "\\'")
            const escUnPrinc = unPrinc.replace(/'/g, "\\'")
            let filtroMestre = ''
            if (regMapa && regMapa.indexOf('LINHA-') !== 0) {
              filtroMestre = `registro_mapa = '${escMapa}' && quantidade_embalagem_principal = ${qtdPrinc} && unidade_medida_principal = '${escUnPrinc}' && forma_acondicionamento = '${escAcond}'`
            } else {
              filtroMestre = `marca_padronizada = '${escMarcaPad}' && quantidade_embalagem_principal = ${qtdPrinc} && unidade_medida_principal = '${escUnPrinc}' && forma_acondicionamento = '${escAcond}'`
            }

            const mestreExistentes =
              txApp.findRecordsByFilter('base_mestre', filtroMestre, '-created', 1, 0) || []

            let recMestre = null
            if (mestreExistentes.length > 0) {
              recMestre = mestreExistentes[0]
            } else {
              recMestre = new Record(colBaseMestre)
            }

            if (regMapa && regMapa.indexOf('LINHA-') !== 0) {
              recMestre.set('registro_mapa', regMapa)
            }
            recMestre.set('nome_completo', nomeFinal)
            recMestre.set('nome_produto', marcaPad)
            recMestre.set('marca_padronizada', marcaPad)
            recMestre.set('principio_ativo', String(paFinal).slice(0, 500))
            recMestre.set('titular_fabricante', String(titularFinal).slice(0, 500))
            recMestre.set('fabricante', String(fabricanteFinal).slice(0, 500))
            recMestre.set(
              'tipo_produto',
              String(data.tipo_produto || 'Produto Formulado Comercial').slice(0, 100),
            )

            // Novos campos divididos da embalagem comercial
            recMestre.set('quantidade_embalagem_principal', qtdPrinc)
            recMestre.set('unidade_medida_principal', unPrinc)
            recMestre.set('forma_acondicionamento', acond)
            recMestre.set('embalagem_original', embTexto)
            recMestre.set('embalagem', `${qtdPrinc} ${unPrinc} (${acond})`)
            recMestre.set('unidade', unPrinc)
            recMestre.set('origem_base', 'BULA_PRODUTOS_ESPELHO_TRIBUTARIO')

            // NCM específica e fiel
            recMestre.set('ncm_especifica', ncmMascara)
            recMestre.set('ncm_padrao', ncmMascara)
            recMestre.set('ncm', ncmLimpo)
            recMestre.set('nota_subpos_2', nota2Val)

            if (isNota2) {
              recMestre.set('ncm_faixa1_ate_300g', '3808.61.00')
              recMestre.set('ncm_faixa2_300g_a_7_5kg', '3808.62.90')
              recMestre.set('ncm_faixa3_7_5kg_a_10kg', '3808.69.90')
              recMestre.set('ncm_faixa4_acima_10kg', '3808.69.90')
              recMestre.set(
                'regra_tipi',
                'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022)',
              )
            } else {
              recMestre.set('ncm_faixa1_ate_300g', ncmMascara)
              recMestre.set('ncm_faixa2_300g_a_7_5kg', ncmMascara)
              recMestre.set('ncm_faixa3_7_5kg_a_10kg', ncmMascara)
              recMestre.set('ncm_faixa4_acima_10kg', ncmMascara)
              recMestre.set(
                'regra_tipi',
                String(
                  data.regra_tipi ||
                    'Posição 38.08 TIPI: Embalagem comercial agrícola com subitens .2x/.9x',
                ),
              )
            }

            recMestre.set('macro_grupo', String(data.macro_grupo || 'Defensivos').slice(0, 100))
            recMestre.set(
              'sub_grupo',
              String(data.classe_agronomica || data.sub_grupo || 'Herbicida').slice(0, 100),
            )
            recMestre.set(
              'status_pis_cofins',
              'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
            )
            recMestre.set('aliquota_ate_mar2026', '0,00% (Lei nº 10.925/2004)')
            recMestre.set('aliquota_pos_abr2026_real', '0,925% (LC nº 224/2025)')
            recMestre.set('aliquota_pos_abr2026_presumido', '0,365% (LC nº 224/2025)')
            recMestre.set('cst_saida', 'CST 06')
            recMestre.set('cst_entrada', 'CST 73')
            recMestre.set(
              'ibs_cbs_2027',
              'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
            )
            recMestre.set(
              'sistema_norma_mapa',
              'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)',
            )
            recMestre.set('status_validacao', 'aprovado')
            recMestre.set(
              'url_oficial',
              String(data.url_oficial || 'https://dados.agricultura.gov.br').slice(0, 500),
            )

            txApp.save(recMestre)
            espelhadosBaseMestre++
          } catch (errMestre) {
            console.log(
              'Aviso: falha ao atualizar espelho tributário na base_mestre (importar_lote):',
              errMestre.message || errMestre,
            )
          }
        }
      }

      // =======================================================================
      // CASO 5: bula_composicao (Sheet 2: Composicao_Em_Linhas)
      // Importação na íntegra SEM REGRAS DE RECUSA/DESCARTES.
      // Idempotência por SKU/Produto: (registro_mapa + codigo / ID Produto Base + substancia/ingrediente_ativo),
      // com fallback para (registro_mapa + nome_produto/marca + ingrediente_ativo) quando código for vazio.
      // Garante 1:1 integral por linha (1.329 linhas) sem fusão indevida entre SKUs do mesmo registro MAPA.
      // =======================================================================
      else if (collectionName === 'bula_composicao') {
        for (let i = 0; i < records.length; i++) {
          const itemWrapper = records[i]
          const data = itemWrapper.data || itemWrapper
          const rowNum = Number(itemWrapper.originalLine) || i + 1

          const regMapaRaw = String(data.registro_mapa || '').trim()
          const ingredienteRaw = String(data.ingrediente_ativo || data.principio_ativo || '').trim()
          const codigoProd = String(data.codigo || '').trim()
          const nomeProd = String(data.nome_produto || '').trim()

          const regMapa = regMapaRaw ? sanitizarMapa(regMapaRaw) : `LINHA-${rowNum}`
          const ingrediente =
            ingredienteRaw ||
            String(data.nome_quimico || data.nome_produto || 'Ingrediente Ativo').trim()

          const escMapa = regMapa.replace(/'/g, "\\'")
          const escIa = ingrediente.replace(/'/g, "\\'")
          const escCodigo = codigoProd.replace(/'/g, "\\'")
          const escNome = nomeProd.replace(/'/g, "\\'")

          // Upsert idempotente composto incluindo o identificador do produto/SKU da linha
          let filtroComp = ''
          if (escCodigo) {
            filtroComp = `registro_mapa = '${escMapa}' && codigo = '${escCodigo}' && ingrediente_ativo = '${escIa}'`
          } else if (escNome) {
            filtroComp = `registro_mapa = '${escMapa}' && nome_produto = '${escNome}' && ingrediente_ativo = '${escIa}'`
          } else {
            filtroComp = `registro_mapa = '${escMapa}' && ingrediente_ativo = '${escIa}'`
          }

          const existentes =
            txApp.findRecordsByFilter('bula_composicao', filtroComp, '-created', 1, 0) || []

          let rec = null
          let isUpdate = false
          if (existentes.length > 0) {
            rec = existentes[0]
            isUpdate = true
          } else {
            rec = new Record(colTarget)
          }

          rec.set('registro_mapa', regMapa)
          rec.set('nome_produto', nomeProd)
          rec.set('ingrediente_ativo', ingrediente)
          rec.set('nome_quimico', String(data.nome_quimico || '').trim())
          rec.set('numero_cas', String(data.numero_cas || '').trim())
          rec.set('concentracao', String(data.concentracao || '').trim())
          rec.set('unidade_medida', String(data.unidade_medida || 'g/L').trim())
          rec.set('funcao_ingrediente', String(data.funcao_ingrediente || '').trim())
          rec.set('grupo_quimico', String(data.grupo_quimico || '').trim())
          rec.set('codigo', codigoProd)
          rec.set('percentual_peso', String(data.percentual_peso || '').trim())
          rec.set('percentual_volume', String(data.percentual_volume || '').trim())
          if (data.dados_extras) rec.set('dados_extras', JSON.stringify(data.dados_extras))

          try {
            txApp.save(rec)
            if (isUpdate) {
              atualizados++
            } else {
              inseridos++
            }
          } catch (err) {
            const detalhe = extrairDetalhesErroDb(err)
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar composição da bula: ${detalhe.motivo}`,
              detalhe.campo || 'ingrediente_ativo',
              ingrediente,
              data,
            )
          }
        }
      }

      // =======================================================================
      // CASO 6: bula_empresas (Sheet 3: Cadeia_Empresas_Linhas)
      // Importação na íntegra SEM REGRAS DE RECUSA/DESCARTES.
      // Idempotência por SKU/Produto: (registro_mapa + codigo + tipo_relacao + razao_social + cnpj)
      // =======================================================================
      else if (collectionName === 'bula_empresas') {
        for (let i = 0; i < records.length; i++) {
          const itemWrapper = records[i]
          const data = itemWrapper.data || itemWrapper
          const rowNum = Number(itemWrapper.originalLine) || i + 1

          const regMapaRaw = String(data.registro_mapa || '').trim()
          const razaoRaw = String(data.razao_social || data.empresa || '').trim()
          const tipoRelacao = String(data.tipo_relacao || 'Formulador').trim()
          const codigoProd = String(data.codigo || '').trim()
          const nomeProd = String(data.nome_produto || '').trim()

          const regMapa = regMapaRaw ? sanitizarMapa(regMapaRaw) : `LINHA-${rowNum}`
          const razao = razaoRaw || String(data.nome_fantasia || 'Empresa Vinculada').trim()

          const escMapa = regMapa.replace(/'/g, "\\'")
          const escRazao = razao.replace(/'/g, "\\'")
          const escTipo = tipoRelacao.replace(/'/g, "\\'")
          const escCodigo = codigoProd.replace(/'/g, "\\'")
          const escNome = nomeProd.replace(/'/g, "\\'")

          const cnpjLimpo = String(data.cnpj || '').trim()
          const escCnpj = cnpjLimpo.replace(/'/g, "\\'")

          // Upsert idempotente por identificador do produto + tipo_relacao + razao_social + cnpj
          let filtroEmp = ''
          if (escCodigo) {
            filtroEmp = escCnpj
              ? `registro_mapa = '${escMapa}' && codigo = '${escCodigo}' && tipo_relacao = '${escTipo}' && razao_social = '${escRazao}' && cnpj = '${escCnpj}'`
              : `registro_mapa = '${escMapa}' && codigo = '${escCodigo}' && tipo_relacao = '${escTipo}' && razao_social = '${escRazao}'`
          } else if (escNome) {
            filtroEmp = escCnpj
              ? `registro_mapa = '${escMapa}' && nome_produto = '${escNome}' && tipo_relacao = '${escTipo}' && razao_social = '${escRazao}' && cnpj = '${escCnpj}'`
              : `registro_mapa = '${escMapa}' && nome_produto = '${escNome}' && tipo_relacao = '${escTipo}' && razao_social = '${escRazao}'`
          } else {
            filtroEmp = escCnpj
              ? `registro_mapa = '${escMapa}' && tipo_relacao = '${escTipo}' && razao_social = '${escRazao}' && cnpj = '${escCnpj}'`
              : `registro_mapa = '${escMapa}' && tipo_relacao = '${escTipo}' && razao_social = '${escRazao}'`
          }

          const existentes =
            txApp.findRecordsByFilter('bula_empresas', filtroEmp, '-created', 1, 0) || []

          let rec = null
          let isUpdate = false
          if (existentes.length > 0) {
            rec = existentes[0]
            isUpdate = true
          } else {
            rec = new Record(colTarget)
          }

          rec.set('registro_mapa', regMapa)
          rec.set('nome_produto', nomeProd)
          rec.set('tipo_relacao', tipoRelacao)
          rec.set('razao_social', razao)
          rec.set('nome_fantasia', String(data.nome_fantasia || '').trim())
          rec.set('cnpj', String(data.cnpj || '').trim())
          rec.set('endereco', String(data.endereco || '').trim())
          rec.set('municipio', String(data.municipio || '').trim())
          rec.set('uf', String(data.uf || '').trim())
          rec.set('pais', String(data.pais || 'Brasil').trim())
          rec.set('codigo', codigoProd)
          rec.set('cep', String(data.cep || '').trim())
          rec.set('bairro', String(data.bairro || '').trim())
          rec.set('inscricao_estadual', String(data.inscricao_estadual || '').trim())
          if (data.dados_extras) rec.set('dados_extras', JSON.stringify(data.dados_extras))

          try {
            txApp.save(rec)
            if (isUpdate) {
              atualizados++
            } else {
              inseridos++
            }
          } catch (err) {
            const detalhe = extrairDetalhesErroDb(err)
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar empresa da bula: ${detalhe.motivo}`,
              detalhe.campo || 'razao_social',
              razao,
              data,
            )
          }
        }
      }

      // =======================================================================
      // CASO 7: bula_embalagens (Sheet 4: Embalagens_NCM_Linhas)
      // Importação na íntegra SEM REGRAS DE RECUSA/DESCARTES.
      // Idempotência por SKU/Produto: (registro_mapa + codigo + tipo_embalagem + capacidade + material)
      // Também gera/atualiza UM cadastro por EMBALAGEM comercial na base_mestre (espelho tributário).
      // =======================================================================
      else if (collectionName === 'bula_embalagens') {
        for (let i = 0; i < records.length; i++) {
          const itemWrapper = records[i]
          const data = itemWrapper.data || itemWrapper
          const rowNum = Number(itemWrapper.originalLine) || i + 1

          const regMapaRaw = String(data.registro_mapa || '').trim()
          const tipoEmb = String(data.tipo_embalagem || data.embalagem || 'Padrão').trim()
          const cap = String(data.capacidade || '').trim()
          const codigoProd = String(data.codigo || '').trim()
          const nomeProd = String(data.nome_produto || '').trim()

          const regMapa = regMapaRaw ? sanitizarMapa(regMapaRaw) : `LINHA-${rowNum}`
          const escMapa = regMapa.replace(/'/g, "\\'")
          const escTipo = tipoEmb.replace(/'/g, "\\'")
          const escCap = cap.replace(/'/g, "\\'")
          const escCodigo = codigoProd.replace(/'/g, "\\'")
          const escNome = nomeProd.replace(/'/g, "\\'")

          const materialLimpo = String(data.material || '').trim()
          const escMat = materialLimpo.replace(/'/g, "\\'")

          // Upsert idempotente por identificador do produto + tipo_embalagem + capacidade + material
          let filtroEmb = ''
          if (escCodigo) {
            filtroEmb = escMat
              ? `registro_mapa = '${escMapa}' && codigo = '${escCodigo}' && tipo_embalagem = '${escTipo}' && capacidade = '${escCap}' && material = '${escMat}'`
              : `registro_mapa = '${escMapa}' && codigo = '${escCodigo}' && tipo_embalagem = '${escTipo}' && capacidade = '${escCap}'`
          } else if (escNome) {
            filtroEmb = escMat
              ? `registro_mapa = '${escMapa}' && nome_produto = '${escNome}' && tipo_embalagem = '${escTipo}' && capacidade = '${escCap}' && material = '${escMat}'`
              : `registro_mapa = '${escMapa}' && nome_produto = '${escNome}' && tipo_embalagem = '${escTipo}' && capacidade = '${escCap}'`
          } else {
            filtroEmb = escMat
              ? `registro_mapa = '${escMapa}' && tipo_embalagem = '${escTipo}' && capacidade = '${escCap}' && material = '${escMat}'`
              : `registro_mapa = '${escMapa}' && tipo_embalagem = '${escTipo}' && capacidade = '${escCap}'`
          }

          const existentes =
            txApp.findRecordsByFilter('bula_embalagens', filtroEmb, '-created', 1, 0) || []

          let rec = null
          let isUpdate = false
          if (existentes.length > 0) {
            rec = existentes[0]
            isUpdate = true
          } else {
            rec = new Record(colTarget)
          }

          rec.set('registro_mapa', regMapa)
          rec.set('nome_produto', nomeProd)
          rec.set('tipo_embalagem', tipoEmb)
          rec.set('material', String(data.material || '').trim())
          rec.set('capacidade', cap)
          rec.set('unidade_medida', String(data.unidade_medida || 'L').trim())
          rec.set('destinacao_final', String(data.destinacao_final || '').trim())
          rec.set('codigo', codigoProd)
          rec.set('descricao_embalagem', String(data.descricao_embalagem || '').trim())
          if (data.dados_extras) rec.set('dados_extras', JSON.stringify(data.dados_extras))

          try {
            txApp.save(rec)
            if (isUpdate) {
              atualizados++
            } else {
              inseridos++
            }
          } catch (err) {
            const detalhe = extrairDetalhesErroDb(err)
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar embalagem da bula: ${detalhe.motivo}`,
              detalhe.campo || 'tipo_embalagem',
              tipoEmb,
              data,
            )
          }

          // ESPELHAMENTO TRIBUTÁRIO NA BASE MESTRE POR EMBALAGEM COMERCIAL
          try {
            const colBaseMestre = txApp.findCollectionByNameOrId('base_mestre')

            // Texto original da embalagem (capacidade, tipo ou texto bruto)
            const textoBrutoEmb = String(
              data.descricao_embalagem ||
                `${cap} ${data.unidade_medida || 'L'} ${tipoEmb}`.trim() ||
                data.embalagem ||
                '',
            ).trim()

            // Parser de embalagem comercial:
            // (a) extrair quantidade principal e unidade (ignorar multiplicador, sempre kg ou L)
            let qtdPrinc = 0
            let unPrinc = 'L'
            const capStr =
              `${cap} ${String(data.unidade_medida || '')} ${textoBrutoEmb}`.toUpperCase()

            const mMultiplo = capStr.match(
              /(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(KG|KGS|KILOS?|QUILOS?|G\b|L\b|LT|LITROS?|ML)/,
            )
            if (mMultiplo) {
              let q = parseFloat(mMultiplo[2].replace(',', '.'))
              const u = mMultiplo[3]
              if (u === 'G' || u === 'ML') q = q * 0.001
              qtdPrinc = q
              unPrinc =
                u.startsWith('KG') || u.startsWith('QUILO') || u.startsWith('KILO') || u === 'G'
                  ? 'KG'
                  : 'L'
            } else {
              const mDireto = capStr.match(
                /(\d+(?:[.,]\d+)?)\s*(KG|KGS|KILOS?|QUILOS?|G\b|L\b|LT|LITROS?|ML)\b/,
              )
              if (mDireto) {
                let q = parseFloat(mDireto[1].replace(',', '.'))
                const u = mDireto[2]
                if (u === 'G' || u === 'ML') q = q * 0.001
                qtdPrinc = q
                unPrinc =
                  u.startsWith('KG') || u.startsWith('QUILO') || u.startsWith('KILO') || u === 'G'
                    ? 'KG'
                    : 'L'
              } else {
                const numCap = parseFloat(String(cap).replace(',', '.'))
                if (!isNaN(numCap) && numCap > 0) {
                  qtdPrinc = numCap
                  const uInf = String(data.unidade_medida || '').toUpperCase()
                  unPrinc =
                    uInf.startsWith('KG') || uInf.startsWith('QUILO') || uInf === 'G' ? 'KG' : 'L'
                } else {
                  qtdPrinc = 20
                  unPrinc = 'L'
                }
              }
            }

            // (b) normalizar forma de acondicionamento (bombona, saco, tambor, big bag, frasco, balde, etc.)
            let acond = ''
            const formaTexto = `${tipoEmb} ${textoBrutoEmb}`.toUpperCase()
            if (formaTexto.includes('BIG BAG') || formaTexto.includes('BIG-BAG')) acond = 'Big Bag'
            else if (formaTexto.includes('BOMBONA')) acond = 'Bombona'
            else if (formaTexto.includes('TAMBOR')) acond = 'Tambor'
            else if (
              formaTexto.includes('SACARIA') ||
              formaTexto.includes('SACO') ||
              formaTexto.includes('SACA')
            )
              acond = 'Saco'
            else if (formaTexto.includes('BALDE')) acond = 'Balde'
            else if (formaTexto.includes('FRASCO') || formaTexto.includes('AMPOULA'))
              acond = 'Frasco'
            else if (formaTexto.includes('GALÃO') || formaTexto.includes('GALAO')) acond = 'Galão'
            else if (
              formaTexto.includes('CONTAINER') ||
              formaTexto.includes('CONTÊINER') ||
              formaTexto.includes('IBC')
            )
              acond = 'Container / IBC'
            else if (formaTexto.includes('CAIXA') || formaTexto.includes('CARTUCHO'))
              acond = 'Caixa'
            else if (formaTexto.includes('SACHE') || formaTexto.includes('SACHET')) acond = 'Sache'
            else {
              if (unPrinc === 'KG') acond = qtdPrinc > 25 ? 'Big Bag' : 'Saco'
              else {
                if (qtdPrinc <= 1) acond = 'Frasco'
                else if (qtdPrinc <= 5) acond = 'Galão'
                else if (qtdPrinc <= 50) acond = 'Bombona'
                else if (qtdPrinc <= 250) acond = 'Tambor'
                else acond = 'Container / IBC'
              }
            }

            // Buscar dados correlacionados do produto em bula_produtos para preencher nome, fabricante, PA e formulação
            let prodRef = null
            if (escCodigo) {
              const pRows =
                txApp.findRecordsByFilter(
                  'bula_produtos',
                  `registro_mapa = '${escMapa}' && codigo = '${escCodigo}'`,
                  '-created',
                  1,
                  0,
                ) || []
              if (pRows.length > 0) prodRef = pRows[0]
            }
            if (!prodRef) {
              const pRows =
                txApp.findRecordsByFilter(
                  'bula_produtos',
                  `registro_mapa = '${escMapa}'`,
                  '-created',
                  1,
                  0,
                ) || []
              if (pRows.length > 0) prodRef = pRows[0]
            }

            const nomeProdFinal =
              nomeProd ||
              (prodRef ? prodRef.getString('nome_comercial') : '') ||
              `Produto MAPA ${regMapa}`
            const marcaPad = sanitizarMarca(nomeProdFinal)
            const paFinal = (prodRef ? prodRef.getString('principio_ativo') : '') || marcaPad
            const titularFinal =
              (prodRef
                ? prodRef.getString('titular_registro') ||
                  prodRef.getString('fabricante_formulador')
                : '') || 'Não Informado'
            const tipoFormulacao = prodRef ? prodRef.getString('tipo_formulacao') : ''
            const macroGrupo = (prodRef ? prodRef.getString('macro_grupo') : '') || 'Defensivos'
            const subGrupo =
              (prodRef
                ? prodRef.getString('classe_agronomica') || prodRef.getString('sub_grupo')
                : '') || 'Herbicida'

            const paTexto = String(paFinal || '').toUpperCase()
            const MOLECULAS_NOTA_2 = [
              'BIFENTRINA',
              'LAMBDA-CIALOTRINA',
              'LAMBDA CIALOTRINA',
              'CLORFENAPIR',
              'CHLORFENAPYR',
              'MALATIONA',
              'MALATHION',
              'FENITROTIONA',
              'BETA-CIFLUTRINA',
              'BETA CIFLUTRINA',
              'CIFLUTRINA',
              'ALFA-CIPERMETRINA',
              'ALFA CIPERMETRINA',
              'ALPHA-CYPERMETHRIN',
              'DELTAMETRINA',
              'PERMETRINA',
              'PROPOXUR',
              'BENDIOCARBE',
              'BENDIOCARB',
            ]
            const isNota2 = MOLECULAS_NOTA_2.some((mol) => paTexto.includes(mol))

            // (d) NCM específica da embalagem comercial
            // EXCEÇÃO EXCLUSIVA DO ROUNDUP WG (MAPA 002094): NCM 3808.93.24
            const isRoundupWg =
              regMapa.includes('002094') ||
              marcaPad.toUpperCase() === 'ROUNDUP WG' ||
              nomeProdFinal.toUpperCase() === 'ROUNDUP WG'

            let ncmEsp = data.ncm || (prodRef ? prodRef.getString('ncm_padrao') : '')
            if (isRoundupWg) {
              ncmEsp = '3808.93.24'
            } else if (isNota2) {
              if (qtdPrinc <= 0.3) ncmEsp = '3808.61.00'
              else if (qtdPrinc <= 7.5) ncmEsp = '3808.62.90'
              else ncmEsp = '3808.69.90'
            } else if (
              regMapa.includes('-') ||
              macroGrupo === 'Fertilizantes' ||
              String(tipoFormulacao || '').includes('Fertilizante')
            ) {
              if (qtdPrinc <= 10 && unPrinc === 'KG') ncmEsp = '3105.10.00'
              else ncmEsp = ncmEsp || '3105.90.90'
            } else if (!ncmEsp) {
              ncmEsp = (prodRef ? prodRef.getString('ncm_padrao') : '') || data.ncm || '3808.93.29'
            }
            const ncmMascara = fmtNcmMascara(ncmEsp)
            const ncmLimpo = ncmMascara.replace(/\D/g, '')

            // IDEMPOTÊNCIA: chave natural = registro_mapa sanitizado + quantidade + unidade + acondicionamento
            const escAcond = acond.replace(/'/g, "\\'")
            const escUnPrinc = unPrinc.replace(/'/g, "\\'")
            let filtroMestre = ''
            if (regMapa && regMapa.indexOf('LINHA-') !== 0) {
              filtroMestre = `registro_mapa = '${escMapa}' && quantidade_embalagem_principal = ${qtdPrinc} && unidade_medida_principal = '${escUnPrinc}' && forma_acondicionamento = '${escAcond}'`
            } else {
              const escMarca = marcaPad.replace(/'/g, "\\'")
              filtroMestre = `marca_padronizada = '${escMarca}' && quantidade_embalagem_principal = ${qtdPrinc} && unidade_medida_principal = '${escUnPrinc}' && forma_acondicionamento = '${escAcond}'`
            }

            const mestreExistentes =
              txApp.findRecordsByFilter('base_mestre', filtroMestre, '-created', 1, 0) || []

            let recMestre = null
            if (mestreExistentes.length > 0) {
              recMestre = mestreExistentes[0]
            } else {
              recMestre = new Record(colBaseMestre)
            }

            if (regMapa && regMapa.indexOf('LINHA-') !== 0) {
              recMestre.set('registro_mapa', regMapa)
            }
            recMestre.set('nome_completo', nomeProdFinal)
            recMestre.set('nome_produto', marcaPad)
            recMestre.set('marca_padronizada', marcaPad)
            recMestre.set('principio_ativo', String(paFinal).slice(0, 500))
            recMestre.set('titular_fabricante', String(titularFinal).slice(0, 500))
            recMestre.set('fabricante', String(titularFinal).slice(0, 500))
            recMestre.set(
              'tipo_produto',
              tipoFormulacao
                ? `Produto Formulado (${tipoFormulacao})`.slice(0, 100)
                : 'Produto Formulado Comercial',
            )

            // Campos de embalagem comercial
            recMestre.set('quantidade_embalagem_principal', qtdPrinc)
            recMestre.set('unidade_medida_principal', unPrinc)
            recMestre.set('forma_acondicionamento', acond)
            recMestre.set(
              'embalagem_original',
              String(textoBrutoEmb || `${qtdPrinc} ${unPrinc} (${acond})`).slice(0, 255),
            )
            recMestre.set('embalagem', `${qtdPrinc} ${unPrinc} (${acond})`)
            recMestre.set('unidade', unPrinc)
            recMestre.set('origem_base', 'BULA_EMBALAGENS_ESPELHO_TRIBUTARIO')

            // NCM específica
            recMestre.set('ncm_especifica', ncmMascara)
            recMestre.set('ncm_padrao', ncmMascara)
            recMestre.set('ncm', ncmLimpo)
            recMestre.set('nota_subpos_2', isNota2 ? 'SIM' : 'NÃO')

            if (isNota2) {
              recMestre.set('ncm_faixa1_ate_300g', '3808.61.00')
              recMestre.set('ncm_faixa2_300g_a_7_5kg', '3808.62.90')
              recMestre.set('ncm_faixa3_7_5kg_a_10kg', '3808.69.90')
              recMestre.set('ncm_faixa4_acima_10kg', '3808.69.90')
              recMestre.set(
                'regra_tipi',
                'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022)',
              )
            } else {
              recMestre.set('ncm_faixa1_ate_300g', ncmMascara)
              recMestre.set('ncm_faixa2_300g_a_7_5kg', ncmMascara)
              recMestre.set('ncm_faixa3_7_5kg_a_10kg', ncmMascara)
              recMestre.set('ncm_faixa4_acima_10kg', ncmMascara)
              recMestre.set(
                'regra_tipi',
                'Posição 38.08 TIPI: Embalagem comercial agrícola com subitens .2x/.9x',
              )
            }

            recMestre.set('macro_grupo', String(macroGrupo).slice(0, 100))
            recMestre.set('sub_grupo', String(subGrupo).slice(0, 100))
            recMestre.set(
              'status_pis_cofins',
              'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
            )
            recMestre.set('aliquota_ate_mar2026', '0,00% (Lei nº 10.925/2004)')
            recMestre.set('aliquota_pos_abr2026_real', '0,925% (LC nº 224/2025)')
            recMestre.set('aliquota_pos_abr2026_presumido', '0,365% (LC nº 224/2025)')
            recMestre.set('cst_saida', 'CST 06')
            recMestre.set('cst_entrada', 'CST 73')
            recMestre.set(
              'ibs_cbs_2027',
              'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
            )
            recMestre.set(
              'sistema_norma_mapa',
              'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)',
            )
            recMestre.set('status_validacao', 'aprovado')

            txApp.save(recMestre)
            espelhadosBaseMestre++
          } catch (errEmbMestre) {
            console.log(
              'Aviso: falha ao espelhar embalagem comercial na base_mestre (bula_embalagens):',
              errEmbMestre.message || errEmbMestre,
            )
          }
        }
      }

      // =======================================================================
      // CASO 8: bula_culturas (Sheet 5: Culturas_Carencia_Linhas)
      // Importação na íntegra SEM REGRAS DE RECUSA/DESCARTES.
      // Idempotência por SKU/Produto: (registro_mapa + codigo + cultura)
      // =======================================================================
      else if (collectionName === 'bula_culturas') {
        for (let i = 0; i < records.length; i++) {
          const itemWrapper = records[i]
          const data = itemWrapper.data || itemWrapper
          const rowNum = Number(itemWrapper.originalLine) || i + 1

          const regMapaRaw = String(data.registro_mapa || '').trim()
          const culturaRaw = String(data.cultura || '').trim()
          const codigoProd = String(data.codigo || '').trim()
          const nomeProd = String(data.nome_produto || '').trim()

          const regMapa = regMapaRaw ? sanitizarMapa(regMapaRaw) : `LINHA-${rowNum}`
          const cultura = culturaRaw || 'Todas as Culturas Autorizadas'

          const escMapa = regMapa.replace(/'/g, "\\'")
          const escCult = cultura.replace(/'/g, "\\'")
          const escCodigo = codigoProd.replace(/'/g, "\\'")
          const escNome = nomeProd.replace(/'/g, "\\'")

          // Upsert idempotente por identificador do produto + cultura
          let filtroCult = ''
          if (escCodigo) {
            filtroCult = `registro_mapa = '${escMapa}' && codigo = '${escCodigo}' && cultura = '${escCult}'`
          } else if (escNome) {
            filtroCult = `registro_mapa = '${escMapa}' && nome_produto = '${escNome}' && cultura = '${escCult}'`
          } else {
            filtroCult = `registro_mapa = '${escMapa}' && cultura = '${escCult}'`
          }

          const existentes =
            txApp.findRecordsByFilter('bula_culturas', filtroCult, '-created', 1, 0) || []

          let rec = null
          let isUpdate = false
          if (existentes.length > 0) {
            rec = existentes[0]
            isUpdate = true
          } else {
            rec = new Record(colTarget)
          }

          rec.set('registro_mapa', regMapa)
          rec.set('nome_produto', nomeProd)
          rec.set('cultura', cultura)
          rec.set('intervalo_seguranca_dias', String(data.intervalo_seguranca_dias || '').trim())
          rec.set('intervalo_reentrada_horas', String(data.intervalo_reentrada_horas || '').trim())
          rec.set('modalidade_emprego', String(data.modalidade_emprego || '').trim())
          rec.set(
            'limite_maximo_residuos_lmr',
            String(data.limite_maximo_residuos_lmr || '').trim(),
          )
          rec.set('observacoes', String(data.observacoes || '').trim())
          rec.set('codigo', codigoProd)
          rec.set('tipo_cultura', String(data.tipo_cultura || '').trim())
          rec.set('epoca_carencia', String(data.epoca_carencia || '').trim())
          if (data.dados_extras) rec.set('dados_extras', JSON.stringify(data.dados_extras))

          try {
            txApp.save(rec)
            if (isUpdate) {
              atualizados++
            } else {
              inseridos++
            }
          } catch (err) {
            const detalhe = extrairDetalhesErroDb(err)
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar cultura da bula: ${detalhe.motivo}`,
              detalhe.campo || 'cultura',
              cultura,
              data,
            )
          }
        }
      }

      // =======================================================================
      // CASO 9: bula_alvos (Sheet 6: Alvos_e_Doses_Linhas)
      // Importação na íntegra SEM REGRAS DE RECUSA/DESCARTES.
      // Idempotência por SKU/Produto: (registro_mapa + codigo + cultura + alvo_biologico)
      // =======================================================================
      else if (collectionName === 'bula_alvos') {
        for (let i = 0; i < records.length; i++) {
          const itemWrapper = records[i]
          const data = itemWrapper.data || itemWrapper
          const rowNum = Number(itemWrapper.originalLine) || i + 1

          const regMapaRaw = String(data.registro_mapa || '').trim()
          const alvoRaw = String(data.alvo_biologico || data.alvo || data.praga || '').trim()
          const cultura = String(data.cultura || '').trim()
          const codigoProd = String(data.codigo || '').trim()
          const nomeProd = String(data.nome_produto || '').trim()

          const regMapa = regMapaRaw ? sanitizarMapa(regMapaRaw) : `LINHA-${rowNum}`
          const alvo = alvoRaw || 'Alvo Biológico da Bula'

          const escMapa = regMapa.replace(/'/g, "\\'")
          const escAlvo = alvo.replace(/'/g, "\\'")
          const escCult = cultura.replace(/'/g, "\\'")
          const escCodigo = codigoProd.replace(/'/g, "\\'")
          const escNome = nomeProd.replace(/'/g, "\\'")

          // Upsert idempotente por identificador do produto + cultura + alvo_biologico
          let filtroAlvo = ''
          if (escCodigo) {
            filtroAlvo = `registro_mapa = '${escMapa}' && codigo = '${escCodigo}' && cultura = '${escCult}' && alvo_biologico = '${escAlvo}'`
          } else if (escNome) {
            filtroAlvo = `registro_mapa = '${escMapa}' && nome_produto = '${escNome}' && cultura = '${escCult}' && alvo_biologico = '${escAlvo}'`
          } else {
            filtroAlvo = `registro_mapa = '${escMapa}' && cultura = '${escCult}' && alvo_biologico = '${escAlvo}'`
          }

          const existentes =
            txApp.findRecordsByFilter('bula_alvos', filtroAlvo, '-created', 1, 0) || []

          let rec = null
          let isUpdate = false
          if (existentes.length > 0) {
            rec = existentes[0]
            isUpdate = true
          } else {
            rec = new Record(colTarget)
          }

          rec.set('registro_mapa', regMapa)
          rec.set('nome_produto', nomeProd)
          rec.set('cultura', cultura)
          rec.set('alvo_biologico', alvo)
          rec.set('nome_cientifico', String(data.nome_cientifico || '').trim())
          rec.set('dose_minima', String(data.dose_minima || '').trim())
          rec.set('dose_maxima', String(data.dose_maxima || '').trim())
          rec.set('unidade_dose', String(data.unidade_dose || '').trim())
          rec.set('volume_calda', String(data.volume_calda || '').trim())
          rec.set('numero_maximo_aplicacoes', String(data.numero_maximo_aplicacoes || '').trim())
          rec.set('epoca_aplicacao', String(data.epoca_aplicacao || '').trim())
          rec.set('codigo', codigoProd)
          rec.set('tipo_alvo', String(data.tipo_alvo || '').trim())
          rec.set('intervalo_aplicacao_dias', String(data.intervalo_aplicacao_dias || '').trim())
          if (data.dados_extras) rec.set('dados_extras', JSON.stringify(data.dados_extras))

          try {
            txApp.save(rec)
            if (isUpdate) {
              atualizados++
            } else {
              inseridos++
            }
          } catch (err) {
            const detalhe = extrairDetalhesErroDb(err)
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar alvo da bula: ${detalhe.motivo}`,
              detalhe.campo || 'alvo_biologico',
              alvo,
              data,
            )
          }
        }
      }

      // =======================================================================
      // CASO 10: bula_aplicacao (Sheet 7: Aplicacao_e_EPI_Linhas)
      // Importação na íntegra SEM REGRAS DE RECUSA/DESCARTES.
      // Idempotência por SKU/Produto: (registro_mapa + codigo + tipo_aplicacao)
      // =======================================================================
      else if (collectionName === 'bula_aplicacao') {
        for (let i = 0; i < records.length; i++) {
          const itemWrapper = records[i]
          const data = itemWrapper.data || itemWrapper
          const rowNum = Number(itemWrapper.originalLine) || i + 1

          const regMapaRaw = String(data.registro_mapa || '').trim()
          const tipoApl = String(data.tipo_aplicacao || 'Geral').trim()
          const codigoProd = String(data.codigo || '').trim()
          const nomeProd = String(data.nome_produto || '').trim()

          const regMapa = regMapaRaw ? sanitizarMapa(regMapaRaw) : `LINHA-${rowNum}`
          const escMapa = regMapa.replace(/'/g, "\\'")
          const escTipo = tipoApl.replace(/'/g, "\\'")
          const escCodigo = codigoProd.replace(/'/g, "\\'")
          const escNome = nomeProd.replace(/'/g, "\\'")

          // Upsert idempotente por identificador do produto + tipo_aplicacao
          let filtroApl = ''
          if (escCodigo) {
            filtroApl = `registro_mapa = '${escMapa}' && codigo = '${escCodigo}' && tipo_aplicacao = '${escTipo}'`
          } else if (escNome) {
            filtroApl = `registro_mapa = '${escMapa}' && nome_produto = '${escNome}' && tipo_aplicacao = '${escTipo}'`
          } else {
            filtroApl = `registro_mapa = '${escMapa}' && tipo_aplicacao = '${escTipo}'`
          }

          const existentes =
            txApp.findRecordsByFilter('bula_aplicacao', filtroApl, '-created', 1, 0) || []

          let rec = null
          let isUpdate = false
          if (existentes.length > 0) {
            rec = existentes[0]
            isUpdate = true
          } else {
            rec = new Record(colTarget)
          }

          rec.set('registro_mapa', regMapa)
          rec.set('nome_produto', nomeProd)
          rec.set('tipo_aplicacao', tipoApl)
          rec.set('equipamento_recomendado', String(data.equipamento_recomendado || '').trim())
          rec.set('condicoes_meteorologicas', String(data.condicoes_meteorologicas || '').trim())
          rec.set('epi_preparo_calda', String(data.epi_preparo_calda || '').trim())
          rec.set('epi_aplicacao', String(data.epi_aplicacao || '').trim())
          rec.set(
            'medidas_primeiros_socorros',
            String(data.medidas_primeiros_socorros || '').trim(),
          )
          rec.set('descarte_embalagens', String(data.descarte_embalagens || '').trim())
          rec.set('codigo', codigoProd)
          rec.set('volume_calda_aplicacao', String(data.volume_calda_aplicacao || '').trim())
          rec.set(
            'classe_toxicologica_aplicacao',
            String(data.classe_toxicologica_aplicacao || '').trim(),
          )
          rec.set('orientacoes_gerais', String(data.orientacoes_gerais || '').trim())
          if (data.dados_extras) rec.set('dados_extras', JSON.stringify(data.dados_extras))

          try {
            txApp.save(rec)
            if (isUpdate) {
              atualizados++
            } else {
              inseridos++
            }
          } catch (err) {
            const detalhe = extrairDetalhesErroDb(err)
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar aplicação/EPI da bula: ${detalhe.motivo}`,
              detalhe.campo || 'tipo_aplicacao',
              tipoApl,
              data,
            )
          }
        }
      }

      // =======================================================================
      // CASO 11: sim_produtos_base (Aba Produtos Base do Simulador Comercial)
      // =======================================================================
      if (collectionName === 'sim_produtos_base') {
        for (let i = 0; i < records.length; i++) {
          const itemWrapper = records[i]
          const data = itemWrapper.data || itemWrapper
          const rowNum = Number(itemWrapper.originalLine) || i + 1

          // 1. Extrair extras brutos se vieram
          let rawObj = {}
          if (data.dados_extras) {
            try {
              rawObj =
                typeof data.dados_extras === 'string'
                  ? JSON.parse(data.dados_extras)
                  : Object.assign({}, data.dados_extras)
            } catch (_) {
              rawObj = {}
            }
          }

          // 2. Descrição: B1_DESC tem prioridade absoluta sobre BM_DESC
          let descricao = String(
            data.descricao ||
              rawObj.B1_DESC ||
              rawObj.b1_desc ||
              data.nome_produto ||
              data.produto ||
              '',
          ).trim()

          const bmDesc = String(
            rawObj.BM_DESC || rawObj.bm_desc || data.grupo || data.bm_desc || '',
          ).trim()

          // Se a descrição recebida for idêntica ao grupo BM_DESC e houver B1_DESC no rawObj, repara
          const rawB1Desc = String(rawObj.B1_DESC || rawObj.b1_desc || '').trim()
          if (rawB1Desc && normTxt(descricao) === normTxt(bmDesc)) {
            descricao = rawB1Desc
          }

          if (!descricao) {
            registrarErro(
              rowNum,
              i + 1,
              'Campo Obrigatório Ausente',
              'A descrição do produto base é obrigatória.',
              'descricao',
              '',
              data,
            )
            continue
          }

          // 3. Código
          const codigo = String(
            data.codigo || rawObj.B1_COD || rawObj.b1_cod || data.cod || '',
          ).trim()

          // 4. NCM canônico: formato 0000.00.00 a partir de data.ncm ou B1_POSIPI
          const rawNcm = String(data.ncm || rawObj.B1_POSIPI || rawObj.b1_posipi || '').trim()
          const ncm = fmtNcmMascara(rawNcm)

          // 5. Embalagem: extrair ou derivar preferindo quantidade × conteúdo no fim
          let embalagem = String(data.embalagem || '').trim()
          if (!embalagem && descricao) {
            const sDesc = String(descricao).trim()
            const mMult = sDesc.match(
              /\b(\d+)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(L|LT|KG|G|ML|SC|DOSES)\b/i,
            )
            if (mMult) {
              let un = mMult[3].toUpperCase()
              if (un === 'LT') un = 'L'
              embalagem = `${mMult[1]}X${mMult[2]}${un}`
            } else {
              const regexFim = /\b(\d+(?:[.,]\d+)?)\s*(L|LT|KG|G|ML|SC|DOSES)\b/gi
              let match
              let lastMatch = null
              while ((match = regexFim.exec(sDesc)) !== null) {
                lastMatch = match
              }
              if (lastMatch) {
                let un = lastMatch[2].toUpperCase()
                if (un === 'LT') un = 'L'
                embalagem = `${lastMatch[1]}${un}`
              }
            }
          }

          // 6. Unidade: deduzida por tipo de produto e embalagem
          const rawUnid = String(data.unidade || rawObj.B1_UM || rawObj.b1_um || '').trim()
          const embUp = (embalagem || '').toUpperCase()
          const dUpper = `${descricao || ''} ${bmDesc || ''} ${rawObj.B1_GRUPO || ''}`.toUpperCase()
          let unidade = ''

          if (
            /\b\d+\s*[xX]\s*\d+(?:[.,]\d+)?\s*(L|LT|ML)\b/i.test(embUp) ||
            /\b\d+(?:[.,]\d+)?\s*(L|LT|ML)\b/i.test(embUp) ||
            embUp.endsWith('L') ||
            embUp.endsWith('LT') ||
            embUp.endsWith('ML')
          ) {
            unidade = 'L'
          } else if (
            /\b\d+\s*[xX]\s*\d+(?:[.,]\d+)?\s*(KG|G|TON|T)\b/i.test(embUp) ||
            /\b\d+(?:[.,]\d+)?\s*(KG|G|TON|T)\b/i.test(embUp) ||
            embUp.endsWith('KG') ||
            embUp.endsWith('G')
          ) {
            unidade = 'KG'
          } else if (
            dUpper.includes('GRANULADO') ||
            dUpper.includes('GRANULADOS') ||
            dUpper.includes('FARELO') ||
            dUpper.includes('PO SOLUVEL') ||
            dUpper.includes('PÓ SOLÚVEL') ||
            dUpper.includes('SÓLIDO') ||
            dUpper.includes('SOLIDO') ||
            dUpper.includes('CALCARIO') ||
            dUpper.includes('GESSO')
          ) {
            const uUp = rawUnid.toUpperCase()
            unidade = ['SC', 'SACO', 'SACAS'].includes(uUp) ? 'SC' : 'KG'
          } else if (rawUnid) {
            const uUp = rawUnid.toUpperCase()
            if (['L', 'LT', 'LITROS', 'ML'].includes(uUp)) unidade = 'L'
            else if (['KG', 'KILOS', 'QUILOS', 'TON', 'T', 'G'].includes(uUp)) unidade = 'KG'
            else if (['SC', 'SACO', 'SACAS'].includes(uUp)) unidade = 'SC'
            else if (['DOSES', 'DOSE'].includes(uUp)) unidade = 'DOSES'
            else if (['UN', 'FRASCO', 'BOMBONA', 'TAMBOR', 'LATA'].includes(uUp)) unidade = 'UN'
          }

          if (!unidade) {
            if (
              /\b(SC|SL|EC|EW|FS|OD|CS|SE)\b/.test(dUpper) ||
              dUpper.includes('OLEO') ||
              dUpper.includes('ÓLEO') ||
              dUpper.includes('LIQUIDO') ||
              dUpper.includes('LÍQUIDO')
            ) {
              unidade = 'L'
            } else if (/\b(WG|WP|GR|DP|SP)\b/.test(dUpper)) {
              unidade = 'KG'
            } else {
              unidade = 'L'
            }
          }

          // 7. Tipo de Produto
          let tipoProduto = String(data.tipo_produto || '').trim()
          if (!tipoProduto || tipoProduto === 'Produto Formulado Comercial') {
            const b1Grupo = String(rawObj.B1_GRUPO || rawObj.b1_grupo || '').trim()
            tipoProduto = normalizarTipoProduto(tipoProduto, bmDesc, `${b1Grupo} ${descricao}`)
          }

          // 8. Origem
          let origem = String(data.origem || '').trim()
          const x5Origem = String(
            rawObj.X5_TABELA || rawObj.X5_DESC || rawObj.x5_tabela || '',
          ).trim()
          if (x5Origem) {
            const x5Up = x5Origem.toUpperCase()
            if (x5Up.includes('IMP') || x5Up.includes('ESTRANGEIR')) {
              origem = 'Importado'
            } else if (x5Up.includes('NAC')) {
              origem = 'Nacional'
            }
          }
          if (!origem) {
            const descUp = descricao.toUpperCase()
            const embUp = embalagem.toUpperCase()
            if (
              descUp.includes('(IMP)') ||
              descUp.includes(' IMP ') ||
              descUp.endsWith(' IMP') ||
              descUp.includes('(SS)') ||
              embUp.includes('IMP')
            ) {
              origem = 'Importado'
            } else {
              origem = 'Nacional'
            }
          }

          // 9. Fabricante
          let fabricante = String(data.fabricante || '').trim()
          if (!fabricante && descricao) {
            const mFab = descricao.match(
              /[-–—]\s*([A-Za-z0-9&.\s]+?)\s*\((?:AGENCIADO|AGENC|DISTRIBUIDO)\)/i,
            )
            if (mFab) {
              fabricante = mFab[1].trim()
            }
          }

          // 10. Princípio Ativo
          const principioAtivo = String(data.principio_ativo || '').trim()

          // 11. Grupo Tributário (gr_trib / B1_GRTRIB2)
          const grTrib = String(
            data.gr_trib ||
              rawObj.B1_GRTRIB2 ||
              rawObj.b1_grtrib2 ||
              rawObj.GRTRIB2 ||
              rawObj.grtrib2 ||
              rawObj.gr_trib ||
              rawObj.grtrib ||
              rawObj.grupo_tributario ||
              '',
          ).trim()

          // 12. Moeda e Preço
          const moeda = String(data.moeda || (origem.toLowerCase().includes('imp') ? 'USD' : 'BRL'))
            .trim()
            .toUpperCase()

          const rawPreco =
            data.preco_base_sugerido !== undefined
              ? data.preco_base_sugerido
              : rawObj.B1_PRV1 || rawObj.b1_prv1 || data.preco_base || data.preco || 0
          const precoBase = Number(rawPreco) || 0

          // Upsert por código (se houver) ou por descrição exata
          let record = null
          let isUpdate = false

          if (codigo) {
            const escCod = codigo.replace(/'/g, "\\'")
            const achados =
              txApp.findRecordsByFilter(
                'sim_produtos_base',
                `codigo = '${escCod}'`,
                '-created',
                1,
                0,
              ) || []
            if (achados.length > 0) {
              record = achados[0]
              isUpdate = true
            }
          }

          if (!record) {
            const escDesc = descricao.replace(/'/g, "\\'")
            const achados =
              txApp.findRecordsByFilter(
                'sim_produtos_base',
                `descricao = '${escDesc}'`,
                '-created',
                1,
                0,
              ) || []
            if (achados.length > 0) {
              record = achados[0]
              isUpdate = true
            }
          }

          if (!record) {
            record = new Record(colTarget)
          }

          record.set('codigo', codigo)
          record.set('descricao', descricao)
          record.set('ncm', ncm)
          record.set('unidade', unidade)
          record.set('tipo_produto', tipoProduto)
          record.set('origem', origem)
          record.set('embalagem', embalagem)
          record.set('principio_ativo', principioAtivo)
          record.set('fabricante', fabricante)
          record.set('moeda', moeda)
          record.set('preco_base_sugerido', precoBase)
          record.set('gr_trib', grTrib)

          // Preservar dados_extras íntegros
          if (data.dados_extras) {
            record.set(
              'dados_extras',
              typeof data.dados_extras === 'string'
                ? data.dados_extras
                : JSON.stringify(data.dados_extras),
            )
          }

          try {
            txApp.save(record)
            if (isUpdate) {
              atualizados++
              ignorados++
            } else {
              inseridos++
            }
          } catch (err) {
            const detalhe = extrairDetalhesErroDb(err)
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar produto base: ${detalhe.motivo}`,
              detalhe.campo || 'sim_produtos_base',
              descricao,
              data,
            )
          }
        }
      }

      // =======================================================================
      // CASO 12: sim_regras_icms (Aba Regra ICMS do Simulador Comercial)
      // =======================================================================
      if (collectionName === 'sim_regras_icms') {
        const ALIASES_HOOK_UF_ORIGEM = [
          'uf_origem',
          'uforigem',
          'origem',
          'uf_orig',
          'uforig',
          'estado_origem',
          'estadoorigem',
          'orig',
          'uf_saida',
          'origem_uf',
          'de_uf',
          'de',
        ]
        const ALIASES_HOOK_UF_DESTINO = [
          'uf_contrapartida',
          'ufcontrapartida',
          'contrapartida',
          'uf_destino',
          'ufdestino',
          'destino',
          'uf_dest',
          'ufdest',
          'estado_destino',
          'estadodestino',
          'dest',
          'uf_entrada',
          'destino_uf',
          'para_uf',
          'para',
        ]
        const ALIASES_HOOK_ALIQUOTA = [
          'carga_trib_icms',
          'cargatribicms',
          'cargatrib_icms',
          'carga_tributaria_icms',
          'cargatributariaicms',
          'carga_icms',
          'cargatrib',
          'aliquota_icms',
          'aliquotaicms',
          'aliq_icms',
          'aliqicms',
          'aliquota',
          'aliq',
          'icms',
          'aliq_nominal',
          'icms_aliquota',
          'taxa_icms',
          'aliquota_nominal',
        ]
        const ALIASES_HOOK_REDUCAO = [
          'reducao_base',
          'reducaobase',
          'red_base',
          'redbase',
          'reducao',
          'perc_reducao',
          'reducao_icms',
          'beneficio_reducao',
          'perc_red',
        ]
        const ALIASES_HOOK_EFETIVA = [
          'carga_icms_final',
          'cargaicmsfinal',
          'cargafinal',
          'carga_final',
          'aliquota_efetiva',
          'aliquotaefetiva',
          'aliq_efetiva',
          'aliqefetiva',
          'icms_efetivo',
          'aliq_final',
          'aliquota_final',
          'efetiva',
        ]
        const ALIASES_HOOK_DIFERIMENTO = [
          'diferimento',
          'diferido',
          'possui_diferimento',
          'tem_diferimento',
          'diferimento_icms',
          'ind_diferimento',
          'flag_diferimento',
        ]
        const ALIASES_HOOK_PERC_DIF = [
          'percentual_diferimento',
          'percentualdiferimento',
          'perc_diferimento',
          'percdiferimento',
          'diferimento_perc',
          'diferimento_percentual',
          'perc_dif',
          'diferimento_taxa',
        ]
        const ALIASES_HOOK_FUND_LEGAL = [
          'fundamentacao_legal',
          'fundamentacaolegal',
          'fundamentacao',
          'base_legal',
          'baselegal',
          'dispositivo',
          'dispositivo_legal',
          'legislacao',
          'amparo_legal',
          'observacao',
          'observacoes',
          'obs',
        ]
        const ALIASES_HOOK_TIPO_OP = [
          'tipo_operacao',
          'tipooperacao',
          'operacao',
          'tipo',
          'natureza_operacao',
          'escopo_operacao',
        ]
        const ALIASES_HOOK_ID_REGRA = [
          'id_regra',
          'idregra',
          'id',
          'codigo_regra',
          'cod_regra',
          'identificador',
        ]
        const ALIASES_HOOK_TIPO_UF_ORIGEM = [
          'tipo_uf_origem',
          'tipouforigem',
          'tipo_origem',
          'tipoorigem',
          'classificacao_origem',
          'classe_uf_origem',
        ]
        const ALIASES_HOOK_TIPO_UF_DESTINO = [
          'tipo_uf_destino',
          'tipoufdestino',
          'tipo_destino',
          'tipodestino',
          'classificacao_destino',
          'classe_uf_destino',
        ]
        const ALIASES_HOOK_GRTRIB_COD = [
          'grtrib',
          'gr_trib',
          'grupo_tributario',
          'grupotributario',
          'grupo_tributario_codigo',
          'cod_grtrib',
          'codigo_grupo_tributario',
          'grupo_trib',
        ]
        const ALIASES_HOOK_GRTRIB_DESC = [
          'descricao_grupo_tributario',
          'descricaogrupotributario',
          'descricao_grupo',
          'desc_grupo_tributario',
          'desc_grtrib',
          'grupo_tributario_descricao',
          'nome_grupo_tributario',
        ]
        const ALIASES_HOOK_PROD_IMP = [
          'prod_importado',
          'prodimportado',
          'produto_importado',
          'produtoimportado',
          'importado',
          'flag_importado',
        ]
        const ALIASES_HOOK_TIPO_DESONERADO = [
          'tipo_desonerado',
          'tipodesonerado',
          'desonerado_tipo',
          'desoneracao_tipo',
          'tipo_desoneracao',
        ]
        const ALIASES_HOOK_ICMS_DESONERADO = [
          'icms_desonerado',
          'icmsdesonerado',
          'perc_icms_desonerado',
          'aliquota_desonerada',
          'desonerado_perc',
        ]
        const ALIASES_HOOK_REGRA_CREDITO = [
          'regra_credito_entrada',
          'regracreditoentrada',
          'credito_entrada',
          'regra_credito',
          'credito_proporcional',
        ]

        for (let i = 0; i < records.length; i++) {
          const itemWrapper = records[i]
          const data = itemWrapper.data || itemWrapper
          const rowNum = Number(itemWrapper.originalLine) || i + 1

          // 1. Extrair extras brutos se vieram
          let rawObj = {}
          if (data.dados_extras) {
            try {
              rawObj =
                typeof data.dados_extras === 'string'
                  ? JSON.parse(data.dados_extras)
                  : Object.assign({}, data.dados_extras)
            } catch (_) {
              rawObj = {}
            }
          }
          // Objeto unificado para resolução agnóstica de colunas
          const objetoUnificado = Object.assign({}, rawObj, data)

          // 2. Extração agnóstica de UF Origem e Destino
          const rawOrigem = extrairValorPorAliasesHook(objetoUnificado, ALIASES_HOOK_UF_ORIGEM)
          const ufOrigem = normalizarUfHook(rawOrigem)

          const rawDestino = extrairValorPorAliasesHook(objetoUnificado, ALIASES_HOOK_UF_DESTINO)
          const ufDestino = normalizarUfHook(rawDestino)

          if (!ufOrigem || !ufDestino) {
            registrarErro(
              rowNum,
              i + 1,
              'UF Inválida',
              `Origem ("${rawOrigem}") e Destino ("${rawDestino}") devem ser siglas ou nomes de estados brasileiros válidos (ex.: SP, MT, PR).`,
              'uf_origem',
              `${rawOrigem}->${rawDestino}`,
              data,
            )
            continue
          }

          // 3. Extração de Alíquotas e Benefícios
          const rawAliqIcms = extrairValorPorAliasesHook(objetoUnificado, ALIASES_HOOK_ALIQUOTA)
          const aliqIcms = normalizarNumeroPercentualHook(rawAliqIcms)

          const rawReducao = extrairValorPorAliasesHook(objetoUnificado, ALIASES_HOOK_REDUCAO)
          const reducaoBase = normalizarNumeroPercentualHook(rawReducao)

          const rawEfetiva = extrairValorPorAliasesHook(objetoUnificado, ALIASES_HOOK_EFETIVA)
          let aliqEfetiva = 0
          if (rawEfetiva) {
            aliqEfetiva = normalizarNumeroPercentualHook(rawEfetiva)
          } else {
            aliqEfetiva = Math.round(aliqIcms * (1 - reducaoBase / 100) * 10000) / 10000
          }

          // 4. Diferimento
          const rawDif = extrairValorPorAliasesHook(objetoUnificado, ALIASES_HOOK_DIFERIMENTO)
          const rawPercDif = extrairValorPorAliasesHook(objetoUnificado, ALIASES_HOOK_PERC_DIF)
          const percDiferimento = normalizarNumeroPercentualHook(rawPercDif)
          const strDif = String(rawDif).toLowerCase().trim()
          const diferimento =
            rawDif === true ||
            strDif === 'sim' ||
            strDif === 's' ||
            strDif === 'true' ||
            strDif === '1' ||
            percDiferimento > 0

          // 5. Fundamentação e Tipo de Operação
          let fundamentacao = extrairValorPorAliasesHook(objetoUnificado, ALIASES_HOOK_FUND_LEGAL)
          if (fundamentacao.length > 2000) fundamentacao = fundamentacao.slice(0, 2000)

          const rawTipoOp = extrairValorPorAliasesHook(objetoUnificado, ALIASES_HOOK_TIPO_OP)
          let tipoOperacao = rawTipoOp
          if (!tipoOperacao) {
            tipoOperacao = ufOrigem === ufDestino ? 'Interna' : 'Interestadual'
          } else {
            const normOp = normTxt(tipoOperacao)
            if (normOp.indexOf('interna') !== -1) {
              tipoOperacao = 'Interna'
            } else if (normOp.indexOf('interestadual') !== -1 || normOp.indexOf('inter') !== -1) {
              tipoOperacao = 'Interestadual'
            }
          }

          // 6. Campos adicionais da estrutura real da planilha
          const idRegra = extrairValorPorAliasesHook(objetoUnificado, ALIASES_HOOK_ID_REGRA)
          const tipoUfOrigem = extrairValorPorAliasesHook(
            objetoUnificado,
            ALIASES_HOOK_TIPO_UF_ORIGEM,
          )
          const tipoUfDestino = extrairValorPorAliasesHook(
            objetoUnificado,
            ALIASES_HOOK_TIPO_UF_DESTINO,
          )
          const grTribCod = extrairValorPorAliasesHook(objetoUnificado, ALIASES_HOOK_GRTRIB_COD)
          const grTribDesc = extrairValorPorAliasesHook(objetoUnificado, ALIASES_HOOK_GRTRIB_DESC)
          const prodImportado = extrairValorPorAliasesHook(objetoUnificado, ALIASES_HOOK_PROD_IMP)
          const tipoDesonerado = extrairValorPorAliasesHook(
            objetoUnificado,
            ALIASES_HOOK_TIPO_DESONERADO,
          )
          const rawIcmsDesonerado = extrairValorPorAliasesHook(
            objetoUnificado,
            ALIASES_HOOK_ICMS_DESONERADO,
          )
          const icmsDesonerado = rawIcmsDesonerado
            ? normalizarNumeroPercentualHook(rawIcmsDesonerado)
            : 0
          const regraCreditoEntrada = extrairValorPorAliasesHook(
            objetoUnificado,
            ALIASES_HOOK_REGRA_CREDITO,
          )

          // 7. Chave composta de idempotência incorporando GrTrib e ID da regra
          let chaveOrigemDestino = `${ufOrigem}_${ufDestino}`
          if (grTribCod) {
            chaveOrigemDestino += `_${grTribCod}`
          }
          if (idRegra) {
            const idLimpo = idRegra.replace(/[^A-Za-z0-9_-]/g, '')
            if (idLimpo && chaveOrigemDestino.indexOf(idLimpo) === -1) {
              chaveOrigemDestino += `_${idLimpo}`
            }
          }

          // 8. Upsert por chave_origem_destino
          const escChave = chaveOrigemDestino.replace(/'/g, "\\'")
          const achados =
            txApp.findRecordsByFilter(
              'sim_regras_icms',
              `chave_origem_destino = '${escChave}'`,
              '-created',
              1,
              0,
            ) || []

          let record = null
          let isUpdate = false

          if (achados.length > 0) {
            record = achados[0]
            isUpdate = true
          } else {
            record = new Record(colTarget)
          }

          record.set('uf_origem', ufOrigem)
          record.set('uf_destino', ufDestino)
          record.set('aliquota_icms', aliqIcms)
          record.set('reducao_base', reducaoBase)
          record.set('aliquota_efetiva', aliqEfetiva)
          record.set('diferimento', diferimento)
          record.set('percentual_diferimento', percDiferimento)
          record.set('fundamentacao_legal', fundamentacao)
          record.set('tipo_operacao', tipoOperacao)
          record.set('chave_origem_destino', chaveOrigemDestino)

          // Novos campos opcionais
          if (idRegra) record.set('id_regra', idRegra)
          if (tipoUfOrigem) record.set('tipo_uf_origem', tipoUfOrigem)
          if (tipoUfDestino) record.set('tipo_uf_destino', tipoUfDestino)
          if (grTribCod) record.set('grupo_tributario_codigo', grTribCod)
          if (grTribDesc) record.set('grupo_tributario_descricao', grTribDesc)
          if (prodImportado) record.set('prod_importado', prodImportado)
          if (tipoDesonerado) record.set('tipo_desonerado', tipoDesonerado)
          if (icmsDesonerado !== undefined) record.set('icms_desonerado', icmsDesonerado)
          if (regraCreditoEntrada) record.set('regra_credito_entrada', regraCreditoEntrada)

          if (data.dados_extras || rawObj) {
            const finalExtras = Object.assign({}, rawObj, data.dados_extras || {})
            record.set(
              'dados_extras',
              typeof finalExtras === 'string' ? finalExtras : JSON.stringify(finalExtras),
            )
          }

          try {
            txApp.save(record)
            if (isUpdate) {
              atualizados++
              ignorados++
            } else {
              inseridos++
            }
          } catch (err) {
            const detalhe = extrairDetalhesErroDb(err)
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar regra ICMS ${chaveOrigemDestino}: ${detalhe.motivo}`,
              detalhe.campo || 'sim_regras_icms',
              chaveOrigemDestino,
              data,
            )
          }
        }
      }
    })

    // Log detalhado de diagnóstico para observabilidade da importação em lote
    const totalDescartados = erros.length
    console.log(
      `[IMPORTAR_LOTE] Coleção="${collectionName}" | Total Recebidas=${records.length} | ` +
        `Inseridas=${inseridos} | Atualizadas=${atualizados} | Descartadas=${totalDescartados}`,
    )
    if (totalDescartados > 0) {
      console.log(
        `[IMPORTAR_LOTE] Motivos de descarte (${collectionName}): ` +
          JSON.stringify(resumoCategorias),
      )
      // Logar os primeiros 5 erros detalhadamente
      for (let eIdx = 0; eIdx < Math.min(erros.length, 5); eIdx++) {
        const item = erros[eIdx]
        console.log(
          `[IMPORTAR_LOTE] Erro #${eIdx + 1}: Linha=${item.linhaOriginal} | Cat="${item.categoria}" | Campo="${item.campo || '-'}" | Motivo="${item.motivo}" | Valor="${item.valor || '-'}"`,
        )
      }
    }

    return e.json(200, {
      sucesso: true,
      collection: collectionName,
      total: records.length,
      inseridos: inseridos,
      atualizados: atualizados,
      ignorados: ignorados,
      espelhadosBaseMestre: espelhadosBaseMestre,
      erros: erros,
      resumoCategorias: resumoCategorias,
    })
  } catch (topErr) {
    console.log('Erro crítico no endpoint de importação em lote:', topErr.message || topErr)
    return e.json(500, {
      sucesso: false,
      error: `Erro interno no servidor ao processar importação em lote: ${topErr.message || String(topErr)}`,
    })
  }
})
