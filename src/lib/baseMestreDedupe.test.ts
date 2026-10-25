import { describe, it, expect } from 'vitest'
import {
  normalizarNomeComercial,
  normalizarPrincipioAtivo,
  normalizarQuantidadeEmbalagem,
  normalizarCodigoMapa,
  gerarChaveDuplicidadeBaseMestre,
  saoProdutosDuplicados,
  encontrarDuplicadoNaLista,
} from './baseMestreDedupe'

describe('Regra de Identificação de Produto Duplicado na Base Mestre (4 campos)', () => {
  describe('Normalização individual dos campos', () => {
    it('normaliza o nome comercial (trim, caixa alta, acentos e caracteres especiais)', () => {
      expect(normalizarNomeComercial('  Roundup WG  ')).toBe('ROUNDUP WG')
      expect(normalizarNomeComercial('Glifosato Técnico')).toBe('GLIFOSATO TECNICO')
      expect(normalizarNomeComercial('Score 250 EC')).toBe('SCORE 250 EC')
    })

    it('normaliza princípio ativo (trim, caixa alta, acentos)', () => {
      expect(normalizarPrincipioAtivo(' Glifosato - sal de potássio ')).toBe(
        'GLIFOSATO - SAL DE POTASSIO',
      )
      expect(normalizarPrincipioAtivo('Azoxistrobina + Ciproconazol')).toBe(
        'AZOXISTROBINA + CIPROCONAZOL',
      )
    })

    it('normaliza quantidade da embalagem como número (ex: "20L" = "20 L" = 20; "4x5L" = 5)', () => {
      expect(normalizarQuantidadeEmbalagem('20L')).toBe(20)
      expect(normalizarQuantidadeEmbalagem('20 L')).toBe(20)
      expect(normalizarQuantidadeEmbalagem(20)).toBe(20)
      expect(normalizarQuantidadeEmbalagem('4x5L')).toBe(5)
      expect(normalizarQuantidadeEmbalagem('1x20KG')).toBe(20)
      expect(normalizarQuantidadeEmbalagem('0,25 kg')).toBe(0.25)
      expect(normalizarQuantidadeEmbalagem('0.5 L')).toBe(0.5)
    })

    it('normaliza código MAPA (zeros à esquerda unificados em número e prefixos)', () => {
      expect(normalizarCodigoMapa('002094')).toBe('2094')
      expect(normalizarCodigoMapa('2094')).toBe('2094')
      expect(normalizarCodigoMapa('Nº 002094')).toBe('2094')
      expect(normalizarCodigoMapa('n° 01119')).toBe('1119')
      expect(normalizarCodigoMapa('ISENTO')).toBe('ISENTO')
      expect(normalizarCodigoMapa('')).toBe('ISENTO')
    })
  })

  describe('Requisitos mandatórios do usuário', () => {
    // 1. Mesmo nome comercial com embalagens diferentes -> NÃO duplicado
    it('mesmo nome comercial com embalagens diferentes -> NÃO duplicado', () => {
      const prodA = {
        nome_comercial: 'ROUNDUP ORIGINAL MAIS',
        principio_ativo: 'Glifosato',
        quantidade_embalagem_principal: 5,
        embalagem: '5 L',
        registro_mapa: '01119',
      }

      const prodB = {
        nome_comercial: 'ROUNDUP ORIGINAL MAIS',
        principio_ativo: 'Glifosato',
        quantidade_embalagem_principal: 20,
        embalagem: '20 L',
        registro_mapa: '01119',
      }

      expect(saoProdutosDuplicados(prodA, prodB)).toBe(false)
      expect(gerarChaveDuplicidadeBaseMestre(prodA)).not.toBe(
        gerarChaveDuplicidadeBaseMestre(prodB),
      )
    })

    // 2. Mesmo nome + MAPA com princípio ativo diferente -> NÃO duplicado
    it('mesmo nome + MAPA com princípio ativo diferente -> NÃO duplicado', () => {
      const prodA = {
        nome_comercial: 'FUNGICIDA PLUS',
        principio_ativo: 'Tebuconazol',
        quantidade_embalagem_principal: 20,
        embalagem: '20 L',
        registro_mapa: '12345',
      }

      const prodB = {
        nome_comercial: 'FUNGICIDA PLUS',
        principio_ativo: 'Difenoconazol',
        quantidade_embalagem_principal: 20,
        embalagem: '20 L',
        registro_mapa: '12345',
      }

      expect(saoProdutosDuplicados(prodA, prodB)).toBe(false)
      expect(gerarChaveDuplicidadeBaseMestre(prodA)).not.toBe(
        gerarChaveDuplicidadeBaseMestre(prodB),
      )
    })

    // 3. Combinação idêntica nos 4 campos -> DUPLICADO
    it('combinação idêntica nos 4 campos -> DUPLICADO (mesmo com variações de caixa, acento e formatação de embalagem/MAPA)', () => {
      const prodA = {
        nome_comercial: 'Roundup WG',
        principio_ativo: 'Glifosato',
        quantidade_embalagem_principal: 20,
        embalagem: 'Saco 20 kg',
        registro_mapa: '002094',
      }

      const prodB = {
        nome_comercial: 'ROUNDUP WG',
        principio_ativo: 'glifosato',
        quantidade_embalagem_principal: '20',
        embalagem: '20KG',
        registro_mapa: '2094',
      }

      expect(saoProdutosDuplicados(prodA, prodB)).toBe(true)
      expect(gerarChaveDuplicidadeBaseMestre(prodA)).toBe(gerarChaveDuplicidadeBaseMestre(prodB))
    })

    // 4. Mesmo princípio ativo com nomes comerciais diferentes -> NÃO duplicado
    it('mesmo princípio ativo e embalagem com nomes comerciais diferentes -> NÃO duplicado', () => {
      const prodA = {
        nome_comercial: 'MARCA ALFA',
        principio_ativo: 'Atrazina',
        quantidade_embalagem_principal: 20,
        embalagem: '20 L',
        registro_mapa: '5555',
      }

      const prodB = {
        nome_comercial: 'MARCA BETA',
        principio_ativo: 'Atrazina',
        quantidade_embalagem_principal: 20,
        embalagem: '20 L',
        registro_mapa: '6666',
      }

      expect(saoProdutosDuplicados(prodA, prodB)).toBe(false)
    })

    // 5. Idempotência de reimportação
    it('idempotência de reimportação: detecta item existente na base pela chave dos 4 campos e permite atualizar em vez de duplicar', () => {
      const baseExistente = [
        {
          id: 'bm_001',
          nome_completo: 'PRIORI XTRA',
          marca_padronizada: 'PRIORI XTRA',
          principio_ativo: 'Azoxistrobina + Ciproconazol',
          quantidade_embalagem_principal: 5,
          forma_acondicionamento: 'Bombona',
          registro_mapa: '005908',
          ncm_especifica: '3808.92.19',
        },
        {
          id: 'bm_002',
          nome_completo: 'PRIORI XTRA',
          marca_padronizada: 'PRIORI XTRA',
          principio_ativo: 'Azoxistrobina + Ciproconazol',
          quantidade_embalagem_principal: 20,
          forma_acondicionamento: 'Bombona',
          registro_mapa: '005908',
          ncm_especifica: '3808.92.19',
        },
      ]

      // Reimportação do registro de 5L (mesma combinação dos 4 campos)
      const linhaReimportada = {
        nome_comercial: 'PRIORI XTRA',
        principio_ativo: 'Azoxistrobina + Ciproconazol',
        quantidade_embalagem_principal: 5,
        embalagem: '5 L',
        registro_mapa: '5908',
        ncm_especifica: '3808.92.19',
      }

      const duplicadoEncontrado = encontrarDuplicadoNaLista(linhaReimportada, baseExistente)
      expect(duplicadoEncontrado).not.toBeNull()
      expect(duplicadoEncontrado?.id).toBe('bm_001') // Achou o de 5L, não o de 20L

      // Nova embalagem de 1L (não existe na base) -> deve ser nulo (novo registro a ser criado)
      const novaEmbalagem = {
        nome_comercial: 'PRIORI XTRA',
        principio_ativo: 'Azoxistrobina + Ciproconazol',
        quantidade_embalagem_principal: 1,
        embalagem: '1 L',
        registro_mapa: '5908',
      }

      const naoEncontrado = encontrarDuplicadoNaLista(novaEmbalagem, baseExistente)
      expect(naoEncontrado).toBeNull()
    })
  })
})
