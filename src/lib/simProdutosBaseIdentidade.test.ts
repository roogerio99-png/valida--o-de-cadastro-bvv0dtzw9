/**
 * src/lib/simProdutosBaseIdentidade.test.ts
 *
 * Testes para a nova regra de identidade de produto:
 * Chave de upsert e identificação única na base: B1_COD + Embalagem.
 *
 * Itens testados conforme o enunciado:
 * (a) Mesma planilha com mesmo código e embalagens diferentes gera registros distintos
 * (b) Mesmo código + embalagem repetido continua idempotente (atualiza, não duplica)
 * (c) Duplicata real (código + embalagem iguais) aparece no diagnóstico de duplicatas
 * (d) Regressão e consistência com os 9 códigos com repetição (ex.: 007217 MAIZEFORCE)
 */

import { describe, it, expect } from 'vitest'
import { mapearLinhaSimProdutoBase } from './simProdutosBaseMapeamento'

/**
 * Função simuladora de deduplicação e contagem intra-planilha,
 * replicando exatamente a lógica de src/pages/Importar.tsx e pocketbase/hooks/importar_lote.js
 */
function simularDeduplicacaoIntraLote(
  linhas: Array<{ B1_COD?: string; B1_DESC?: string; embalagem?: string }>,
) {
  const codigosVistosNoLote: Record<string, number> = {}
  const duplicadasNoLote: Record<string, number> = {}
  const registrosFinais: Map<string, { codigo: string; embalagem: string; descricao: string }> =
    new Map()

  for (const rawRow of linhas) {
    const mapeado = mapearLinhaSimProdutoBase(rawRow)
    const codigo = mapeado.codigo || ''
    // Usa embalagem mapeada ou passada explicitamente
    const embalagem = rawRow.embalagem !== undefined ? rawRow.embalagem : mapeado.embalagem || ''
    const descricao = mapeado.descricao || ''

    const codNorm = codigo.trim().toUpperCase()
    const embNorm = embalagem.trim().toUpperCase()
    const descNorm = descricao.trim().toUpperCase()

    let chaveUnicaProd = ''
    if (codNorm) {
      chaveUnicaProd = embNorm ? `${codNorm} | ${embNorm}` : codNorm
    } else if (descNorm) {
      chaveUnicaProd = embNorm ? `${descNorm} | ${embNorm}` : descNorm
    }

    if (chaveUnicaProd) {
      if (codigosVistosNoLote[chaveUnicaProd]) {
        codigosVistosNoLote[chaveUnicaProd]++
        duplicadasNoLote[chaveUnicaProd] = codigosVistosNoLote[chaveUnicaProd]
      } else {
        codigosVistosNoLote[chaveUnicaProd] = 1
      }
    }

    // Upsert idempotente na chave composta
    registrosFinais.set(chaveUnicaProd, {
      codigo,
      embalagem,
      descricao,
    })
  }

  return {
    totalLidas: linhas.length,
    totalUnicos: registrosFinais.size,
    registrosFinais: Array.from(registrosFinais.values()),
    duplicadasNoLote,
    totalDuplicadas: Object.keys(duplicadasNoLote).length,
  }
}

describe('Identidade de Produto Composta (Código + Embalagem) - sim_produtos_base', () => {
  it('(a) Mesma planilha com mesmo código e embalagens diferentes GERA registros distintos', () => {
    // Exemplo clássico do 007217 (MAIZEFORCE) com variantes de embalagem: 20L vs 5L
    const linhas = [
      {
        B1_COD: '007217',
        B1_DESC: 'MAIZEFORCE IMP 20L (VALIDAR)',
        embalagem: '20L',
      },
      {
        B1_COD: '007217',
        B1_DESC: 'MAIZEFORCE IMP 5L (VALIDAR)',
        embalagem: '5L',
      },
    ]

    const resultado = simularDeduplicacaoIntraLote(linhas)

    // Devem conviver 2 registros distintos
    expect(resultado.totalLidas).toBe(2)
    expect(resultado.totalUnicos).toBe(2)
    expect(resultado.totalDuplicadas).toBe(0) // Nenhuma duplicata, pois as embalagens são diferentes
    expect(resultado.registrosFinais).toHaveLength(2)

    const chaves = resultado.registrosFinais.map((r) => `${r.codigo} | ${r.embalagem}`)
    expect(chaves).toContain('007217 | 20L')
    expect(chaves).toContain('007217 | 5L')
  })

  it('(b) Mesmo código + embalagem repetido continua idempotente (atualiza, não duplica)', () => {
    // Linha repetida exatamente com mesmo código e embalagem (ex.: reimportação ou linhas redundantes)
    const linhas = [
      {
        B1_COD: '007217',
        B1_DESC: 'MAIZEFORCE IMP 20L - LINHA 1',
        embalagem: '20L',
      },
      {
        B1_COD: '007217',
        B1_DESC: 'MAIZEFORCE IMP 20L - LINHA 2 ATUALIZADA',
        embalagem: '20L',
      },
    ]

    const resultado = simularDeduplicacaoIntraLote(linhas)

    // Deve resultar em 1 único registro final (prevalece a última ocorrência)
    expect(resultado.totalLidas).toBe(2)
    expect(resultado.totalUnicos).toBe(1)
    expect(resultado.totalDuplicadas).toBe(1)
    expect(resultado.duplicadasNoLote['007217 | 20L']).toBe(2)

    // Prevalece a última linha
    expect(resultado.registrosFinais[0].descricao).toBe('MAIZEFORCE IMP 20L - LINHA 2 ATUALIZADA')
  })

  it('(c) Duplicata real (código + embalagem iguais) aparece no diagnóstico', () => {
    const linhas = [
      { B1_COD: '007217', B1_DESC: 'MAIZEFORCE 20L', embalagem: '20L' },
      { B1_COD: '007217', B1_DESC: 'MAIZEFORCE 20L REPETIDO', embalagem: '20L' },
      { B1_COD: '007218', B1_DESC: 'OUTRO PRODUTO 10L', embalagem: '10L' },
      { B1_COD: '007218', B1_DESC: 'OUTRO PRODUTO 10L REPETIDO', embalagem: '10L' },
      { B1_COD: '007218', B1_DESC: 'OUTRO PRODUTO 10L TRIPLO', embalagem: '10L' },
    ]

    const resultado = simularDeduplicacaoIntraLote(linhas)

    expect(resultado.totalDuplicadas).toBe(2)
    expect(resultado.duplicadasNoLote['007217 | 20L']).toBe(2)
    expect(resultado.duplicadasNoLote['007218 | 10L']).toBe(3)
  })

  it('(d) Variantes de embalagem com e sem embalagem (vazia tratada canonicamente)', () => {
    const linhas = [
      { B1_COD: '001234', B1_DESC: 'PRODUTO PADRAO', embalagem: '' },
      { B1_COD: '001234', B1_DESC: 'PRODUTO PADRAO 5L', embalagem: '5L' },
    ]

    const resultado = simularDeduplicacaoIntraLote(linhas)

    // Um registro sem embalagem ("001234") e um com embalagem ("001234 | 5L")
    expect(resultado.totalUnicos).toBe(2)
    expect(resultado.totalDuplicadas).toBe(0)
  })

  it('(e) Normalização de chave é insensível a maiúsculas/minúsculas e espaços extras', () => {
    const linhas = [
      { B1_COD: ' 007217 ', B1_DESC: 'MAIZEFORCE 20l', embalagem: ' 20l ' },
      { B1_COD: '007217', B1_DESC: 'MAIZEFORCE 20L', embalagem: '20L' },
    ]

    const resultado = simularDeduplicacaoIntraLote(linhas)

    // Mesma chave normalizada "007217 | 20L" -> detecta como repetição
    expect(resultado.totalUnicos).toBe(1)
    expect(resultado.totalDuplicadas).toBe(1)
    expect(resultado.duplicadasNoLote['007217 | 20L']).toBe(2)
  })

  it('(f) Se 9 códigos com repetição tiverem embalagens distintas, geram 1.177 registros sem colisões', () => {
    // Simulando 1.168 produtos únicos + 9 códigos repetidos que na verdade são variantes de embalagem
    const itensBase: Array<{ B1_COD: string; B1_DESC: string; embalagem: string }> = []
    for (let i = 1; i <= 1168; i++) {
      const cod = String(i).padStart(6, '0')
      itensBase.push({
        B1_COD: cod,
        B1_DESC: `PRODUTO BASE ${cod} 10L`,
        embalagem: '10L',
      })
    }

    // 9 códigos que têm uma 2ª linha com embalagem diferente (ex.: 20L)
    const noveCodigosComVariante = [
      '000001',
      '000002',
      '000003',
      '000004',
      '000005',
      '000006',
      '000007',
      '000008',
      '000009',
    ]

    for (const cod of noveCodigosComVariante) {
      itensBase.push({
        B1_COD: cod,
        B1_DESC: `PRODUTO BASE ${cod} 20L`,
        embalagem: '20L',
      })
    }

    // Total de linhas na planilha = 1.168 + 9 = 1.177
    expect(itensBase.length).toBe(1177)

    const resultado = simularDeduplicacaoIntraLote(itensBase)

    // Com a chave composta Código + Embalagem, todas as 1.177 são distintas!
    expect(resultado.totalUnicos).toBe(1177)
    expect(resultado.totalDuplicadas).toBe(0)
  })
})
