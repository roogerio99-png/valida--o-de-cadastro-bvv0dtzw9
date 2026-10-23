/**
 * pocketbase/migrations/1740000026_backfill_bula_principio_ativo.js
 *
 * Backfill seguro e idempotente de `principio_ativo` e campos irmãos
 * na coleção `bula_produtos`.
 *
 * Utiliza:
 * 1. `bula_composicao`: Ingredientes ativos com mesmo código / registro MAPA
 * 2. `base_mestre`: Cadastro mestre com mesmo registro MAPA normalizado ou marca padronizada
 * 3. `dados_extras`: Fallback
 *
 * É idempotente: roda sem erros mesmo em banco vazio ou já atualizado.
 */

migrate(
  (app) => {
    if (!app.hasTable('bula_produtos')) return

    function extrairDigitos(s) {
      return String(s || '').replace(/\D/g, '')
    }

    function normalizarMapaChave(reg) {
      if (!reg) return ''
      const s = String(reg).trim().toUpperCase()
      if (s.includes('ISENTO')) return 'ISENTO'
      if (s.startsWith('TC')) return s.replace(/\s+/g, '')
      const digits = s.replace(/\D/g, '')
      if (digits) {
        const semZero = digits.replace(/^0+/, '')
        return semZero || '0'
      }
      return s.replace(/[^A-Z0-9]/g, '')
    }

    function normalizarTexto(txt) {
      return String(txt || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
    }

    function isInerteOuExcipiente(funcao, ingrediente) {
      const txt = normalizarTexto(`${funcao} ${ingrediente}`)
      return (
        txt.includes('INERTE') ||
        txt.includes('EXCIPIENTE') ||
        txt.includes('OUTROS INGREDIENTES') ||
        txt.includes('DISPERSANTE') ||
        txt.includes('SOLVENTE') ||
        txt.includes('EMULSIFICANTE') ||
        txt.includes('ADJUVANTE DE FORMULACAO') ||
        txt.includes('VEICULO')
      )
    }

    // 1. Carregar composições
    const compPorMapa = {}
    const compPorCodigo = {}
    if (app.hasTable('bula_composicao')) {
      const composicoes =
        app.findRecordsByFilter('bula_composicao', 'id != ""', 'id', 50000, 0) || []
      for (let i = 0; i < composicoes.length; i++) {
        const c = composicoes[i]
        const ia = String(c.getString('ingrediente_ativo') || '').trim()
        const func = String(c.getString('funcao_ingrediente') || '').trim()
        const regMapa = c.getString('registro_mapa')
        const cod = c.getString('codigo')

        if (!ia || isInerteOuExcipiente(func, ia)) continue

        let iaLimpo = ia.replace(/\s+\(\s*Equiv\.[^)]+\)/i, '').trim()
        const chaveMapa = normalizarMapaChave(regMapa)
        if (chaveMapa) {
          if (!compPorMapa[chaveMapa]) compPorMapa[chaveMapa] = []
          if (!compPorMapa[chaveMapa].includes(iaLimpo)) {
            compPorMapa[chaveMapa].push(iaLimpo)
          }
        }
        if (cod) {
          if (!compPorCodigo[cod]) compPorCodigo[cod] = []
          if (!compPorCodigo[cod].includes(iaLimpo)) {
            compPorCodigo[cod].push(iaLimpo)
          }
        }
      }
    }

    // 2. Carregar Base Mestre
    const mestrePorMapa = {}
    const mestrePorMarca = {}
    if (app.hasTable('base_mestre')) {
      const produtosMestre =
        app.findRecordsByFilter('base_mestre', 'id != ""', 'id', 50000, 0) || []
      for (let i = 0; i < produtosMestre.length; i++) {
        const m = produtosMestre[i]
        const pa = String(m.getString('principio_ativo') || '').trim()
        const regMapa = m.getString('registro_mapa')
        const marca = normalizarTexto(
          m.getString('marca_padronizada') || m.getString('nome_produto'),
        )
        const ncmPadrao = m.getString('ncm_padrao') || m.getString('ncm')
        const ncmOficial = m.getString('ncm_faixa1_ate_300g') || ncmPadrao
        const emb = m.getString('embalagem')
        const notaSubpos = m.getString('nota_subpos_2')
        const regraTipi = m.getString('regra_tipi') || m.getString('regra_tipi_embalagem')
        const urlOficial = m.getString('url_oficial')

        const mestreData = {
          principio_ativo: pa,
          ncm_padrao: ncmPadrao,
          ncm_oficial_exata: ncmOficial,
          embalagem: emb,
          nota_subpos_2: notaSubpos,
          regra_tipi: regraTipi,
          url_oficial: urlOficial,
        }

        const chaveMapa = normalizarMapaChave(regMapa)
        if (chaveMapa && !mestrePorMapa[chaveMapa]) {
          mestrePorMapa[chaveMapa] = mestreData
        } else if (chaveMapa && pa && !mestrePorMapa[chaveMapa].principio_ativo) {
          mestrePorMapa[chaveMapa] = mestreData
        }

        if (marca && !mestrePorMarca[marca]) {
          mestrePorMarca[marca] = mestreData
        }
      }
    }

    // 3. Atualizar produtos de bula
    const produtosBula =
      app.findRecordsByFilter('bula_produtos', 'id != ""', 'created', 50000, 0) || []
    let atualizados = 0

    for (let i = 0; i < produtosBula.length; i++) {
      const p = produtosBula[i]
      const paAtual = String(p.getString('principio_ativo') || '').trim()
      const regMapa = p.getString('registro_mapa')
      const cod = p.getString('codigo')
      const marca = normalizarTexto(
        p.getString('marca_padronizada') || p.getString('nome_comercial'),
      )
      const chaveMapa = normalizarMapaChave(regMapa)

      let dadosExtras = {}
      const rawExtras = p.getString('dados_extras')
      if (rawExtras) {
        try {
          dadosExtras = JSON.parse(rawExtras) || {}
        } catch (_) {
          dadosExtras = {}
        }
      }

      let novoPa = paAtual

      // Fallback A: Composição
      if (!novoPa) {
        let listaPa = []
        if (cod && compPorCodigo[cod] && compPorCodigo[cod].length > 0) {
          listaPa = compPorCodigo[cod]
        } else if (chaveMapa && compPorMapa[chaveMapa] && compPorMapa[chaveMapa].length > 0) {
          listaPa = compPorMapa[chaveMapa]
        }

        if (listaPa && listaPa.length > 0) {
          novoPa = listaPa.join(' + ')
        }
      }

      // Fallback B: Base Mestre
      if (!novoPa) {
        let mestre = null
        if (chaveMapa && mestrePorMapa[chaveMapa] && mestrePorMapa[chaveMapa].principio_ativo) {
          mestre = mestrePorMapa[chaveMapa]
        } else if (marca && mestrePorMarca[marca] && mestrePorMarca[marca].principio_ativo) {
          mestre = mestrePorMarca[marca]
        }

        if (mestre && mestre.principio_ativo) {
          novoPa = mestre.principio_ativo
        }
      }

      // Fallback C: dados_extras
      if (!novoPa && dadosExtras) {
        const paExtra =
          dadosExtras['principio_ativo'] ||
          dadosExtras['principio_ativo_original'] ||
          dadosExtras['Princípio Ativo (texto completo da planilha)'] ||
          dadosExtras['substancia_principio_ativo'] ||
          dadosExtras['ingrediente_ativo']
        if (paExtra && String(paExtra).trim()) {
          novoPa = String(paExtra).trim()
        }
      }

      const mestreRef =
        (chaveMapa && mestrePorMapa[chaveMapa]) || (marca && mestrePorMarca[marca]) || null

      let houveAlteracao = false

      if (novoPa && novoPa !== paAtual) {
        p.set('principio_ativo', novoPa)
        houveAlteracao = true
      }

      const paOficialAtual = String(p.getString('pa_oficial_correto') || '').trim()
      if (!paOficialAtual && novoPa) {
        p.set('pa_oficial_correto', novoPa)
        houveAlteracao = true
      }

      const mapaLimpoAtual = String(p.getString('mapa_oficial_limpo') || '').trim()
      if (!mapaLimpoAtual && regMapa) {
        const digits = extrairDigitos(regMapa)
        if (digits) {
          const limpoFormatado = digits.length < 4 ? digits.padStart(4, '0') : digits
          p.set('mapa_oficial_limpo', limpoFormatado)
          houveAlteracao = true
        }
      }

      if (mestreRef) {
        const ncmPadraoAtual = String(p.getString('ncm_padrao') || '').trim()
        if (!ncmPadraoAtual && mestreRef.ncm_padrao) {
          p.set('ncm_padrao', mestreRef.ncm_padrao)
          houveAlteracao = true
        }

        const ncmOficialAtual = String(p.getString('ncm_oficial_exata') || '').trim()
        if (!ncmOficialAtual && mestreRef.ncm_oficial_exata) {
          p.set('ncm_oficial_exata', mestreRef.ncm_oficial_exata)
          houveAlteracao = true
        }

        const embAtual = String(p.getString('embalagem') || '').trim()
        if (!embAtual && mestreRef.embalagem) {
          p.set('embalagem', mestreRef.embalagem)
          houveAlteracao = true
        }

        const notaSubposAtual = String(p.getString('nota_subpos_2') || '').trim()
        if (!notaSubposAtual && mestreRef.nota_subpos_2) {
          p.set('nota_subpos_2', mestreRef.nota_subpos_2)
          houveAlteracao = true
        }

        const regraTipiAtual = String(p.getString('regra_tipi') || '').trim()
        if (!regraTipiAtual && mestreRef.regra_tipi) {
          p.set('regra_tipi', mestreRef.regra_tipi)
          houveAlteracao = true
        }

        const urlAtual = String(p.getString('url_oficial') || '').trim()
        if (!urlAtual && mestreRef.url_oficial) {
          p.set('url_oficial', mestreRef.url_oficial)
          houveAlteracao = true
        }
      }

      if (houveAlteracao) {
        try {
          app.save(p)
          atualizados++
        } catch (err) {
          console.log(
            'Aviso ao atualizar bula_produtos na migracao:',
            p.id,
            err && err.message ? err.message : err,
          )
        }
      }
    }

    console.log(
      `Migração 1740000026 concluiu backfill: ${atualizados} registros atualizados em bula_produtos.`,
    )
  },
  (app) => {
    // Reversão no-op
  },
)
