/**
 * pocketbase/hooks/bula_recalcular_pa.js
 *
 * Endpoint POST /backend/v1/bula/recalcular-principios-ativos
 *
 * Atualiza em massa o campo `principio_ativo` e os campos irmãos
 * (`pa_oficial_correto`, `ncm_padrao`, `ncm_oficial_exata`, `embalagem`, etc.)
 * na coleção `bula_produtos`, utilizando as seguintes fontes por ordem de preferência:
 *
 * 1. `bula_composicao`: Ingredientes ativos com o mesmo registro MAPA e/ou código.
 *    Filtra ingredientes ativos (não inertes/excipientes). Concatena múltiplos com " + ".
 * 2. `base_mestre`: Cadastro mestre do sistema com o mesmo registro MAPA (comparação normalizada
 *    de registro MAPA: "002094" vs "Nº 002094" vs "2094") ou pela mesma marca padronizada.
 * 3. `dados_extras`: Fallback caso o JSON interno do próprio registro possua o dado.
 *
 * Permissões:
 * - Autenticado (analista ou admin) ou execução de manutenção autorizada.
 */

routerAdd('POST', '/backend/v1/bula/recalcular-principios-ativos', (e) => {
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
      error: 'Apenas administradores podem executar o recálculo de princípios ativos.',
    })
  }

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
      // Remove zeros à esquerda para ter a chave puramente numérica uniforme: "002094" -> "2094"
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

  try {
    const colBulaProd = $app.findCollectionByNameOrId('bula_produtos')
    const colBulaComp = $app.findCollectionByNameOrId('bula_composicao')
    const colBaseMestre = $app.findCollectionByNameOrId('base_mestre')

    // Carregar todas as composições da bula para montar índice por chave de mapa e por código
    const composicoes =
      $app.findRecordsByFilter('bula_composicao', 'id != ""', 'id', 50000, 0) || []

    // mapaNorm -> [ingrediente1, ingrediente2, ...]
    // codigo -> [ingrediente1, ingrediente2, ...]
    const compPorMapa = {}
    const compPorCodigo = {}

    for (let i = 0; i < composicoes.length; i++) {
      const c = composicoes[i]
      const ia = String(c.getString('ingrediente_ativo') || '').trim()
      const func = String(c.getString('funcao_ingrediente') || '').trim()
      const regMapa = c.getString('registro_mapa')
      const cod = c.getString('codigo')

      if (!ia || isInerteOuExcipiente(func, ia)) {
        continue
      }

      // Limpar menções adicionais como percentuais ou "Equiv." para manter o nome puro quando apropriado
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

    // Carregar registros da Base Mestre para montar índice por chave de registro MAPA e por marca
    const produtosMestre = $app.findRecordsByFilter('base_mestre', 'id != ""', 'id', 50000, 0) || []
    const mestrePorMapa = {}
    const mestrePorMarca = {}

    for (let i = 0; i < produtosMestre.length; i++) {
      const m = produtosMestre[i]
      const pa = String(m.getString('principio_ativo') || '').trim()
      const regMapa = m.getString('registro_mapa')
      const marca = normalizarTexto(m.getString('marca_padronizada') || m.getString('nome_produto'))
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

    // Carregar produtos da Bula
    const produtosBula =
      $app.findRecordsByFilter('bula_produtos', 'id != ""', 'created', 50000, 0) || []

    let totalAnalisados = produtosBula.length
    let totalAtualizados = 0
    let resolvidosPorComposicao = 0
    let resolvidosPorBaseMestre = 0
    let resolvidosPorExtras = 0
    let mantidosPreenchidos = 0
    let semFonte = 0
    const erros = []
    const exemplos = []

    $app.runInTransaction((txApp) => {
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
        let fontePa = ''

        // 1. Se princípio ativo já estiver preenchido e não for vazio
        if (novoPa) {
          fontePa = 'ja_preenchido'
          mantidosPreenchidos++
        }

        // 2. Se vazio, tentar por bula_composicao (prioridade A)
        if (!novoPa) {
          let listaPa = []
          if (cod && compPorCodigo[cod] && compPorCodigo[cod].length > 0) {
            listaPa = compPorCodigo[cod]
          } else if (chaveMapa && compPorMapa[chaveMapa] && compPorMapa[chaveMapa].length > 0) {
            listaPa = compPorMapa[chaveMapa]
          }

          if (listaPa && listaPa.length > 0) {
            novoPa = listaPa.join(' + ')
            fontePa = 'bula_composicao'
            resolvidosPorComposicao++
          }
        }

        // 3. Se ainda vazio, tentar por base_mestre (prioridade B)
        if (!novoPa) {
          let mestre = null
          if (chaveMapa && mestrePorMapa[chaveMapa] && mestrePorMapa[chaveMapa].principio_ativo) {
            mestre = mestrePorMapa[chaveMapa]
          } else if (marca && mestrePorMarca[marca] && mestrePorMarca[marca].principio_ativo) {
            mestre = mestrePorMarca[marca]
          }

          if (mestre && mestre.principio_ativo) {
            novoPa = mestre.principio_ativo
            fontePa = 'base_mestre'
            resolvidosPorBaseMestre++
          }
        }

        // 4. Se ainda vazio, fallback por dados_extras do próprio registro
        if (!novoPa && dadosExtras) {
          const paExtra =
            dadosExtras['principio_ativo'] ||
            dadosExtras['principio_ativo_original'] ||
            dadosExtras['Princípio Ativo (texto completo da planilha)'] ||
            dadosExtras['substancia_principio_ativo'] ||
            dadosExtras['ingrediente_ativo']
          if (paExtra && String(paExtra).trim()) {
            novoPa = String(paExtra).trim()
            fontePa = 'dados_extras'
            resolvidosPorExtras++
          }
        }

        if (!novoPa) {
          semFonte++
        }

        // Buscar dados irmãos de Base Mestre para enriquecimento (quando vazios no registro de bula)
        const mestreRef =
          (chaveMapa && mestrePorMapa[chaveMapa]) || (marca && mestrePorMarca[marca]) || null

        let houveAlteracao = false

        if (novoPa && novoPa !== paAtual) {
          p.set('principio_ativo', novoPa)
          houveAlteracao = true
        }

        // pa_oficial_correto: se vazio e temos novoPa
        const paOficialAtual = String(p.getString('pa_oficial_correto') || '').trim()
        if (!paOficialAtual && novoPa) {
          p.set('pa_oficial_correto', novoPa)
          houveAlteracao = true
        }

        // mapa_oficial_limpo: se vazio e temos chaveMapa numérica
        const mapaLimpoAtual = String(p.getString('mapa_oficial_limpo') || '').trim()
        if (!mapaLimpoAtual && regMapa) {
          const digits = extrairDigitos(regMapa)
          if (digits) {
            const limpoFormatado = digits.length < 4 ? digits.padStart(4, '0') : digits
            p.set('mapa_oficial_limpo', limpoFormatado)
            houveAlteracao = true
          }
        }

        // Enriquecimento com campos irmãos da Base Mestre apenas se a fonte tiver e o registro atual estiver vazio
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
            txApp.save(p)
            totalAtualizados++

            if (exemplos.length < 15) {
              exemplos.push({
                nome_comercial: p.getString('nome_comercial'),
                registro_mapa: regMapa,
                principio_ativo: p.getString('principio_ativo'),
                ncm_padrao: p.getString('ncm_padrao'),
                fonte: fontePa,
              })
            }
          } catch (saveErr) {
            erros.push({
              id: p.id,
              nome_comercial: p.getString('nome_comercial'),
              registro_mapa: regMapa,
              erro: saveErr && saveErr.message ? saveErr.message : String(saveErr),
            })
          }
        }
      }
    })

    return e.json(200, {
      sucesso: true,
      mensagem: 'Recálculo e enriquecimento de princípios ativos concluído com sucesso.',
      totalAnalisados: totalAnalisados,
      totalAtualizados: totalAtualizados,
      mantidosPreenchidos: mantidosPreenchidos,
      semFonte: semFonte,
      detalhesFontes: {
        resolvidosPorComposicao: resolvidosPorComposicao,
        resolvidosPorBaseMestre: resolvidosPorBaseMestre,
        resolvidosPorExtras: resolvidosPorExtras,
      },
      exemplos: exemplos,
      totalErros: erros.length,
      erros: erros.slice(0, 10),
    })
  } catch (err) {
    console.log(
      'Erro crítico ao recalcular princípios ativos da bula:',
      err && err.message ? err.message : err,
    )
    return e.json(500, {
      sucesso: false,
      error:
        'Erro no servidor durante o recálculo: ' + (err && err.message ? err.message : String(err)),
    })
  }
})
