/**
 * POST /backend/v1/limpar-bases
 * Endpoint protegido para limpeza total das coleções base_mestre e/ou dicionario_principios_ativos.
 *
 * Requisitos de segurança:
 * - Autenticação obrigatória (usuário logado via token PocketBase)
 * - Confirmação explícita no corpo: campo `confirmar: "LIMPAR"`
 *
 * Escopo de limpeza:
 * - `alvo`: "todas" (padrão) | "base_mestre" | "dicionario_principios_ativos"
 * - NUNCA toca em: validacoes_historico / log_validacoes, sincronizacao_historico,
 *   regras_ncm_embalagem, parametrizacao_fiscal ou users.
 *
 * Retorno:
 * - JSON com contagem de registros apagados por coleção e timestamp da operação.
 */

routerAdd('POST', '/backend/v1/limpar-bases', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, {
      sucesso: false,
      error:
        'Acesso não autorizado. É necessário estar autenticado para executar a limpeza das bases.',
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

  const confirmacao = String(body.confirmar || '')
    .trim()
    .toUpperCase()
  if (confirmacao !== 'LIMPAR') {
    return e.json(400, {
      sucesso: false,
      error:
        'Confirmação inválida. É obrigatório informar { confirmar: "LIMPAR" } no corpo da requisição para autorizar a exclusão permanente dos dados.',
    })
  }

  const alvo = String(body.alvo || 'todas')
    .trim()
    .toLowerCase()
  const limparBaseMestre = alvo === 'todas' || alvo === 'base_mestre'
  const limparPrincipios = alvo === 'todas' || alvo === 'dicionario_principios_ativos'

  let apagadosBaseMestre = 0
  let apagadosDicionarioPa = 0

  // 1. Limpeza de base_mestre
  if (limparBaseMestre) {
    try {
      apagadosBaseMestre = $app.countRecords('base_mestre')
    } catch (_) {
      apagadosBaseMestre = 0
    }

    try {
      const colBaseMestre = $app.findCollectionByNameOrId('base_mestre')
      $app.truncateCollection(colBaseMestre)
    } catch (err) {
      console.log('Aviso ao truncar base_mestre:', err.message)
      // Fallback para DELETE via query se truncate falhar
      try {
        $app.db().newQuery('DELETE FROM base_mestre').execute()
      } catch (sqlErr) {
        return e.json(500, {
          sucesso: false,
          error: 'Falha ao limpar base_mestre: ' + sqlErr.message,
        })
      }
    }
  }

  // 2. Limpeza de dicionario_principios_ativos (respeitando ON DELETE RESTRICT)
  if (limparPrincipios) {
    // Se a base_mestre NÃO foi limpa nesta mesma chamada, verificar se existem produtos vinculados
    if (!limparBaseMestre) {
      const totalProdutosRestantes = $app.countRecords('base_mestre')
      if (totalProdutosRestantes > 0) {
        return e.json(400, {
          sucesso: false,
          error: `Restrição de integridade (ON DELETE RESTRICT): Não é permitido limpar a Matriz de Princípios Ativos enquanto houver ${totalProdutosRestantes} produto(s) cadastrado(s) na Base Mestre. Limpe a Base Mestre primeiro ou selecione "Limpar Todas as Bases".`,
        })
      }
    }

    try {
      apagadosDicionarioPa = $app.countRecords('dicionario_principios_ativos')
    } catch (_) {
      apagadosDicionarioPa = 0
    }

    try {
      const colPa = $app.findCollectionByNameOrId('dicionario_principios_ativos')
      $app.truncateCollection(colPa)
    } catch (err) {
      console.log('Aviso ao truncar dicionario_principios_ativos:', err.message)
      try {
        $app.db().newQuery('DELETE FROM dicionario_principios_ativos').execute()
      } catch (sqlErr) {
        return e.json(500, {
          sucesso: false,
          error: 'Falha ao limpar dicionario_principios_ativos: ' + sqlErr.message,
        })
      }
    }
  }

  return e.json(200, {
    sucesso: true,
    mensagem: 'Limpeza de base executada com sucesso.',
    executado_por: authRecord.getString('email') || authRecord.id,
    alvo: alvo,
    apagados: {
      base_mestre: apagadosBaseMestre,
      dicionario_principios_ativos: apagadosDicionarioPa,
      total: apagadosBaseMestre + apagadosDicionarioPa,
    },
    preservados: [
      'log_validacoes',
      'sincronizacao_historico',
      'regras_ncm_embalagem',
      'parametrizacao_fiscal',
      'users',
    ],
    timestamp: new Date().toISOString(),
  })
})

/**
 * POST /backend/v1/limpar-bula
 * Endpoint protegido para limpeza total das 7 coleções do Cadastro de Bula:
 * - bula_produtos (Mestre)
 * - bula_composicao (Composição em Linhas)
 * - bula_empresas (Cadeia de Empresas)
 * - bula_embalagens (Embalagens x NCM)
 * - bula_culturas (Culturas e Carência)
 * - bula_alvos (Alvos e Doses)
 * - bula_aplicacao (Aplicação e EPI)
 *
 * Requisitos:
 * - Autenticação obrigatória (usuário logado via token PocketBase)
 * - Confirmação explícita no corpo: campo `confirmar: "LIMPAR"`
 * - NUNCA toca em: base_mestre, users, regras_ncm_embalagem,
 *   dicionario_principios_ativos, etc.
 *
 * Retorno:
 * - JSON com contagem de registros apagados por cada uma das 7 coleções e total.
 */
routerAdd('POST', '/backend/v1/limpar-bula', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, {
      sucesso: false,
      error:
        'Acesso não autorizado. É necessário estar autenticado para executar a limpeza do Cadastro de Bula.',
    })
  }

  const info = e.requestInfo()
  const body = info.body || {}

  const confirmacao = String(body.confirmar || '')
    .trim()
    .toUpperCase()
  if (confirmacao !== 'LIMPAR') {
    return e.json(400, {
      sucesso: false,
      error:
        'Confirmação inválida. É obrigatório informar { confirmar: "LIMPAR" } no corpo da requisição para autorizar a exclusão permanente dos dados de bula.',
    })
  }

  const colecoesBula = [
    'bula_aplicacao',
    'bula_alvos',
    'bula_culturas',
    'bula_embalagens',
    'bula_empresas',
    'bula_composicao',
    'bula_produtos',
  ]

  const contagens = {
    bula_produtos: 0,
    bula_composicao: 0,
    bula_empresas: 0,
    bula_embalagens: 0,
    bula_culturas: 0,
    bula_alvos: 0,
    bula_aplicacao: 0,
    total: 0,
  }

  // Obter contagens antes de truncar
  for (let i = 0; i < colecoesBula.length; i++) {
    const nomeCol = colecoesBula[i]
    try {
      contagens[nomeCol] = $app.countRecords(nomeCol)
    } catch (_) {
      contagens[nomeCol] = 0
    }
  }

  const userRole = authRecord.getString('role') || 'analista'
  if (userRole !== 'admin') {
    return e.json(403, {
      sucesso: false,
      error: 'Apenas administradores podem executar a limpeza do Cadastro de Bula.',
    })
  }

  // Exclusão em lote na ordem inversa de dependência (acessórias primeiro, depois mestre)
  for (let i = 0; i < colecoesBula.length; i++) {
    const nomeCol = colecoesBula[i]
    try {
      $app
        .db()
        .newQuery('DELETE FROM ' + nomeCol)
        .execute()
    } catch (sqlErr) {
      try {
        const col = $app.findCollectionByNameOrId(nomeCol)
        $app.truncateCollection(col)
      } catch (truncErr) {
        const msg = sqlErr ? sqlErr.message || String(sqlErr) : String(truncErr)
        return e.json(500, {
          sucesso: false,
          error: 'Falha ao limpar coleção ' + nomeCol + ': ' + msg,
        })
      }
    }
  }

  const totalGeral =
    contagens.bula_produtos +
    contagens.bula_composicao +
    contagens.bula_empresas +
    contagens.bula_embalagens +
    contagens.bula_culturas +
    contagens.bula_alvos +
    contagens.bula_aplicacao
  contagens.total = totalGeral

  return e.json(200, {
    sucesso: true,
    mensagem: 'Limpeza do Cadastro de Bula executada com sucesso.',
    executado_por: authRecord.getString('email') || authRecord.id,
    apagados: contagens,
    preservados: [
      'base_mestre',
      'dicionario_principios_ativos',
      'regras_ncm_embalagem',
      'parametrizacao_fiscal',
      'log_validacoes',
      'sincronizacao_historico',
      'users',
    ],
    timestamp: new Date().toISOString(),
  })
})
