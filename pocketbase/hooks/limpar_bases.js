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
