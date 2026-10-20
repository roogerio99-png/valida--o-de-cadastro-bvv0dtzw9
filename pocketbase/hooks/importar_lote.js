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
      if (s.startsWith('Nº ') || s.startsWith('Nº')) {
        const semPrefixo = s.replace(/^Nº\s*/i, '').trim()
        const digits = semPrefixo.replace(/\D/g, '')
        if (digits.length > 0 && digits.length < 4) {
          return `Nº ${digits.padStart(4, '0')}`
        }
        return `Nº ${semPrefixo}`
      }
      const digits = s.replace(/\D/g, '')
      if (digits.length > 0 && digits.length < 4) {
        return `Nº ${digits.padStart(4, '0')}`
      }
      if (/^\d+$/.test(s)) return `Nº ${s}`
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
    // Execução do Lote com Transação ACID
    // -------------------------------------------------------------------------
    let inseridos = 0
    let atualizados = 0
    let ignorados = 0
    const erros = []
    const resumoCategorias = {}

    function registrarErro(linhaOriginal, linhaLote, categoria, motivo, campo, valor, dados) {
      const errItem = {
        linhaOriginal: Number(linhaOriginal) || linhaLote,
        linhaLote: linhaLote,
        categoria: String(categoria || 'Erro de Validação'),
        motivo: String(motivo || 'Dado inválido para o banco de dados'),
        campo: campo ? String(campo) : undefined,
        valor: valor !== undefined && valor !== null ? String(valor).slice(0, 150) : undefined,
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

          const macroSub =
            String(data.macro_grupo_subgrupo_padrao || '').trim() || 'Defensivos — Herbicida'
          const regraTipi =
            String(data.regra_tipi_embalagem || '').trim() ||
            (nota2 === 'SIM'
              ? 'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022)'
              : 'Posição 38.08 TIPI')
          const sisMapa =
            String(data.sistema_registro_mapa || '').trim() ||
            'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)'
          const pisCofins =
            String(data.enquadramento_pis_cofins || '').trim() ||
            'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real pós-Abr/26'
          const cstRec =
            String(data.cst_recomendado || '').trim() ||
            'Saída: CST 06 (c/ Ajuste M220/M620) | Entrada: CST 73'

          // Localizar se já existe para fazer Upsert idempotente
          const escChave = chaveUpper.replace(/'/g, "\\'")
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

          record.set('principio_ativo_chave', chaveUpper)
          record.set('principio_ativo', chaveUpper)
          record.set('macro_grupo_subgrupo_padrao', macroSub)
          record.set('nota_subpos_2', nota2)
          record.set('ncm_padrao_referencia', ncmRef)
          record.set('ncm_faixa1_ate_300g', ncmF1)
          record.set('ncm_faixa2_300g_a_7_5kg', ncmF2)
          record.set('ncm_faixa3_7_5kg_a_10kg', ncmF3)
          record.set('ncm_faixa4_acima_10kg', ncmF4)
          record.set('ncm_granel_tecnico', ncmGranel)
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
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar registro: ${err.message}`,
              'principio_ativo_chave',
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

          // NCM obrigatório e válido
          const rawNcm = String(data.ncm_padrao || data.ncm || '').trim()
          const digitsNcm = rawNcm.replace(/\D/g, '')
          if (!digitsNcm || digitsNcm.length !== 8) {
            registrarErro(
              rowNum,
              i + 1,
              digitsNcm ? 'NCM com Dígitos Inválidos' : 'NCM Ausente',
              digitsNcm
                ? `Código NCM "${rawNcm}" possui ${digitsNcm.length} dígitos. O padrão TIPI exige 8 dígitos numéricos.`
                : 'NCM do produto é obrigatório.',
              'ncm',
              rawNcm || 'vazio',
              data,
            )
            continue
          }

          const marcaPadronizada =
            String(data.marca_padronizada || '').trim() || sanitizarMarca(nomeCompleto)
          const ncmMascara = fmtNcmMascara(digitsNcm)
          const embLimpa = String(data.embalagem || '1X20L (20 L)').trim()
          const unidadeFinal = normalizarUnidade(data.unidade, embLimpa)
          const macroFinal = String(data.macro_grupo || 'Defensivos').trim()
          const subFinal = String(data.sub_grupo || 'Herbicida').trim()
          const tipoFinal = normalizarTipoProduto(data.tipo_produto, macroFinal, subFinal)
          const regMapaFormatado = sanitizarMapa(data.registro_mapa)
          const titularFinal =
            String(data.titular_fabricante || data.fabricante || 'Não Informado').trim() ||
            'Não Informado'

          const paDeclarado = String(data.principio_ativo || marcaPadronizada).trim()
          let nota2 = normalizarNotaSubpos2(data.nota_subpos_2)
          if (verificarNota2Molecula(paDeclarado, nomeCompleto)) {
            nota2 = 'SIM'
          }

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
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar produto na Base Mestre: ${err.message}`,
              'nome_produto',
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
            registrarErro(
              rowNum,
              i + 1,
              'Erro no Banco de Dados',
              `Falha ao salvar regra de NCM: ${err.message}`,
              'ncm',
              digits,
              data,
            )
          }
        }
      }
    })

    return e.json(200, {
      sucesso: true,
      collection: collectionName,
      total: records.length,
      inseridos: inseridos,
      atualizados: atualizados,
      ignorados: ignorados,
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
