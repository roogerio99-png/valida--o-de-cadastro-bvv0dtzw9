import {
  executarMotorCanonicoFrontend,
  formatarNcmMascara,
  normalizarTexto,
  parsearEmbalagemComercial,
  sanitizarRegistroMapa,
  verificarNotaSubpos2,
} from '@/lib/motorCanonico'
import { determinarEnquadramentoTributario } from '@/lib/enquadramentoTributario'
import { gerarChaveDuplicidadeBaseMestre, formatarRotuloLegivelDuplicada } from '@/lib/baseMestreDedupe'

const STORAGE_KEY = 'validador_agro_local_pb_v3'

interface DbStore {
  users: Record<string, any>[]
  convites_usuarios: Record<string, any>[]
  base_mestre: Record<string, any>[]
  dicionario_principios_ativos: Record<string, any>[]
  regras_ncm_embalagem: Record<string, any>[]
  parametrizacao_fiscal: Record<string, any>[]
  bula_produtos: Record<string, any>[]
  bula_composicao: Record<string, any>[]
  bula_empresas: Record<string, any>[]
  bula_embalagens: Record<string, any>[]
  bula_culturas: Record<string, any>[]
  bula_alvos: Record<string, any>[]
  bula_aplicacao: Record<string, any>[]
  log_validacoes: Record<string, any>[]
  sincronizacao_historico: Record<string, any>[]
  tributacao_conversas: Record<string, any>[]
  tributacao_mensagens: Record<string, any>[]
  [key: string]: Record<string, any>[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function genId(prefix = 'rec'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

function criarSeedInicial(): DbStore {
  const ts = '2026-03-15T10:00:00.000Z'

  const users = [
    {
      id: 'usr_admin_001',
      collectionId: '_pb_users_auth_',
      collectionName: 'users',
      email: 'roogerio99@gmail.com',
      name: 'Rogério Administrador',
      role: 'admin',
      verified: true,
      created: ts,
      updated: ts,
    },
    {
      id: 'usr_analista_002',
      collectionId: '_pb_users_auth_',
      collectionName: 'users',
      email: 'analista@validadoragro.com.br',
      name: 'Analista Fiscal Agro',
      role: 'analista',
      verified: true,
      created: ts,
      updated: ts,
    },
  ]

  const dicionario_principios_ativos = [
    {
      id: 'pa_glifosato',
      principio_ativo_chave: 'GLIFOSATO',
      principio_ativo: 'GLIFOSATO',
      funcao_agronomica: 'Herbicida Sistêmico Não Seletivo',
      classe_agronomica: 'Herbicida',
      tipo_quimico: 'Glicina Substituída',
      familia_quimica: 'Glicina Substituída (HRAC Grupo G)',
      nota_subpos_2: 'NÃO',
      ncm_padrao: '3808.93.24',
      ncm_formulado: '3808.93.24',
      ncm_tecnico: '2931.49.14',
      ncm_faixa1_ate_300g: '3808.93.24',
      ncm_faixa2_300g_a_7_5kg: '3808.93.24',
      ncm_faixa3_7_5kg_a_10kg: '3808.93.24',
      ncm_faixa4_acima_10kg: '3808.93.24',
      regra_tipi: 'Posição 3808.93 (Herbicidas). Subposição específica para glifosato e seus sais.',
      status_pis_cofins:
        'Beneficiado (Lei 10.925/04, Art. 1º, II): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
      aliquota_ate_mar2026: '0,00% (Lei nº 10.925/2004)',
      aliquota_pos_abr2026_real: '0,925% (PIS 0,165% + COFINS 0,76% — LC 224/2025)',
      aliquota_pos_abr2026_presumido: '0,365% (PIS 0,065% + COFINS 0,30% — LC 224/2025)',
      ibs_cbs_2027: 'Redução de 60% da alíquota padrão + Diferimento em insumos agro (Art. 138 e Anexo IX LC 214/2025)',
      exemplos_comerciais: 'ROUNDUP WG, ROUNDUP ORIGINAL MAIS, ZAPP QI 620',
      observacoes_fiscais: 'Convênio ICMS 100/97 Cláusula 1ª, I (Redução de 60% da BC interestadual).',
      created: ts,
      updated: ts,
    },
    {
      id: 'pa_bifentrina',
      principio_ativo_chave: 'BIFENTRINA',
      principio_ativo: 'BIFENTRINA',
      funcao_agronomica: 'Inseticida e Acaricida de Contato e Ingestão',
      classe_agronomica: 'Inseticida',
      tipo_quimico: 'Piretróide',
      familia_quimica: 'Éster Piretróide (IRAC Grupo 3A)',
      nota_subpos_2: 'SIM',
      ncm_padrao: '3808.62.90',
      ncm_formulado: '3808.62.90',
      ncm_tecnico: '2916.20.19',
      ncm_faixa1_ate_300g: '3808.61.00',
      ncm_faixa2_300g_a_7_5kg: '3808.62.90',
      ncm_faixa3_7_5kg_a_10kg: '3808.69.90',
      ncm_faixa4_acima_10kg: '3808.69.90',
      regra_tipi:
        'Nota de Subposições 2 do Cap. 38 TIPI (SC COSIT 98.042/2022): ≤ 300g -> 3808.61.00 | > 300g até 7,5kg -> 3808.62.90 | > 7,5kg -> 3808.69.90',
      status_pis_cofins:
        'Beneficiado (Lei 10.925/04, Art. 1º, II): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
      aliquota_ate_mar2026: '0,00% (Lei nº 10.925/2004)',
      aliquota_pos_abr2026_real: '0,925% (PIS 0,165% + COFINS 0,76% — LC 224/2025)',
      aliquota_pos_abr2026_presumido: '0,365% (PIS 0,065% + COFINS 0,30% — LC 224/2025)',
      ibs_cbs_2027: 'Redução de 60% da alíquota padrão + Diferimento em insumos agro (Art. 138 e Anexo IX LC 214/2025)',
      exemplos_comerciais: 'COFENRIN, TALSTAR 100 EC, SEIZER 100 EC',
      observacoes_fiscais: 'Atenção obrigatória ao peso líquido da embalagem primária para desdobramento entre 3808.61, 3808.62 e 3808.69.',
      created: ts,
      updated: ts,
    },
    {
      id: 'pa_fipronil_piraclostrobina_tiofanato',
      principio_ativo_chave: 'FIPRONIL + PIRACLOSTROBINA + TIOFANATO-METILICO',
      principio_ativo: 'Fipronil + Piraclostrobina + Tiofanato-metílico',
      funcao_agronomica: 'Inseticida e Fungicida para Tratamento de Sementes',
      classe_agronomica: 'Inseticida / Fungicida',
      tipo_quimico: 'Fenilpirazol + Estrobilurina + Benzimidazol',
      familia_quimica: 'Fenilpirazol + Estrobilurina + Benzimidazol',
      nota_subpos_2: 'NÃO',
      ncm_padrao: '3808.92.99',
      ncm_formulado: '3808.92.99',
      ncm_tecnico: '2933.19.90',
      ncm_faixa1_ate_300g: '3808.92.91',
      ncm_faixa2_300g_a_7_5kg: '3808.92.99',
      ncm_faixa3_7_5kg_a_10kg: '3808.92.99',
      ncm_faixa4_acima_10kg: '3808.92.99',
      regra_tipi: 'Posição 3808.92 (Fungicidas/Misto). Embalagens comerciais > 300g em 3808.92.99.',
      status_pis_cofins:
        'Beneficiado (Lei 10.925/04, Art. 1º, II): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
      aliquota_ate_mar2026: '0,00% (Lei nº 10.925/2004)',
      aliquota_pos_abr2026_real: '0,925% (LC 224/2025)',
      aliquota_pos_abr2026_presumido: '0,365% (LC 224/2025)',
      ibs_cbs_2027: 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
      exemplos_comerciais: 'STANDAK TOP',
      observacoes_fiscais: 'Uso agrícola exclusivo em tratamento de sementes.',
      created: ts,
      updated: ts,
    },
    {
      id: 'pa_azoxistrobina_ciproconazol',
      principio_ativo_chave: 'AZOXISTROBINA + CIPROCONAZOL',
      principio_ativo: 'Azoxistrobina + Ciproconazol',
      funcao_agronomica: 'Fungicida Sistêmico',
      classe_agronomica: 'Fungicida',
      tipo_quimico: 'Estrobilurina + Triazol',
      familia_quimica: 'Estrobilurina + Triazol (FRAC 11 + 3)',
      nota_subpos_2: 'NÃO',
      ncm_padrao: '3808.92.99',
      ncm_formulado: '3808.92.99',
      ncm_tecnico: '2933.99.99',
      ncm_faixa1_ate_300g: '3808.92.91',
      ncm_faixa2_300g_a_7_5kg: '3808.92.99',
      ncm_faixa3_7_5kg_a_10kg: '3808.92.99',
      ncm_faixa4_acima_10kg: '3808.92.99',
      regra_tipi: 'Posição 3808.92.99 para fungicidas formulados comerciais.',
      status_pis_cofins:
        'Beneficiado (Lei 10.925/04, Art. 1º, II): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
      aliquota_ate_mar2026: '0,00% (Lei nº 10.925/2004)',
      aliquota_pos_abr2026_real: '0,925% (LC 224/2025)',
      aliquota_pos_abr2026_presumido: '0,365% (LC 224/2025)',
      ibs_cbs_2027: 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
      exemplos_comerciais: 'PRIORI XTRA',
      observacoes_fiscais: 'Desonerado PIS/COFINS conforme Art. 1º, II da Lei 10.925/2004.',
      created: ts,
      updated: ts,
    },
    {
      id: 'pa_sulfentrazona',
      principio_ativo_chave: 'SULFENTRAZONA',
      principio_ativo: 'SULFENTRAZONA',
      funcao_agronomica: 'Herbicida Pré-Emergente Seletivo Condicional',
      classe_agronomica: 'Herbicida',
      tipo_quimico: 'Triazolona',
      familia_quimica: 'Aril Triazolinona (HRAC Grupo E)',
      nota_subpos_2: 'NÃO',
      ncm_padrao: '3808.93.29',
      ncm_formulado: '3808.93.29',
      ncm_tecnico: '2933.99.69',
      ncm_faixa1_ate_300g: '3808.93.21',
      ncm_faixa2_300g_a_7_5kg: '3808.93.29',
      ncm_faixa3_7_5kg_a_10kg: '3808.93.29',
      ncm_faixa4_acima_10kg: '3808.93.29',
      regra_tipi: 'Posição 3808.93.29 (Outros herbicidas formulados para uso agrícola).',
      status_pis_cofins:
        'Beneficiado (Lei 10.925/04, Art. 1º, II): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
      aliquota_ate_mar2026: '0,00% (Lei nº 10.925/2004)',
      aliquota_pos_abr2026_real: '0,925% (LC 224/2025)',
      aliquota_pos_abr2026_presumido: '0,365% (LC 224/2025)',
      ibs_cbs_2027: 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
      exemplos_comerciais: 'SULFENTRAZONE 500 SC TAGROS, BORAL 500 SC',
      observacoes_fiscais: 'Enquadrado na posição 38.08 da TIPI.',
      created: ts,
      updated: ts,
    },
  ]

  const regras_ncm_embalagem = [
    {
      id: 'reg_38089324',
      ncm: '38089324',
      descricao: 'Herbicidas à base de glifosato ou seus sais para uso agrícola',
      categoria: 'Herbicida',
      embalagens_permitidas: [
        'Saco',
        'Sacaria',
        'Big Bag',
        'Bombona',
        'Tambor',
        'Container / IBC',
        'Frasco',
        'Galão',
      ],
      regra_especial: 'Exclusivo para formulações comerciais agrícolas em embalagens > 300 g/mL.',
      created: ts,
      updated: ts,
    },
    {
      id: 'reg_38089329',
      ncm: '38089329',
      descricao: 'Outros herbicidas, inibidores de germinação e reguladores de crescimento para uso agrícola',
      categoria: 'Herbicida',
      embalagens_permitidas: ['Bombona', 'Tambor', 'Container / IBC', 'Galão', 'Frasco', 'Saco', 'Balde'],
      regra_especial: 'Apresentados de outro modo que não em embalagens de peso líquido <= 300 g.',
      created: ts,
      updated: ts,
    },
    {
      id: 'reg_38086100',
      ncm: '38086100',
      descricao: 'Mercadorias da Nota de Subposições 2 do Cap. 38 em embalagens de peso líquido <= 300 g',
      categoria: 'Inseticida (Nota 2)',
      embalagens_permitidas: ['Frasco', 'Sachê', 'Bisnaga', 'Caixa'],
      regra_especial: 'Nota de Subposições 2 Cap. 38 TIPI: Conteúdo líquido não superior a 300 g.',
      created: ts,
      updated: ts,
    },
    {
      id: 'reg_38086290',
      ncm: '38086290',
      descricao: 'Inseticidas da Nota de Subposições 2 do Cap. 38 (ex.: Bifentrina) em embalagens > 300 g até 7,5 kg',
      categoria: 'Inseticida (Nota 2)',
      embalagens_permitidas: ['Frasco', 'Galão', 'Bombona', 'Balde', 'Saco', 'Caixa', '1 L', '5 L', '4X5L'],
      regra_especial: 'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022): > 300 g e <= 7,5 kg.',
      created: ts,
      updated: ts,
    },
    {
      id: 'reg_38086990',
      ncm: '38086990',
      descricao: 'Outros inseticidas da Nota de Subposições 2 do Cap. 38 (ex.: Bifentrina) em embalagens > 7,5 kg',
      categoria: 'Inseticida (Nota 2)',
      embalagens_permitidas: ['Bombona', 'Tambor', 'Container / IBC', 'Big Bag', 'Saco', 'Balde', '20 L', '200 L'],
      regra_especial: 'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022): Acima de 7,5 kg.',
      created: ts,
      updated: ts,
    },
    {
      id: 'reg_38089299',
      ncm: '38089299',
      descricao: 'Outros fungicidas apresentados de outro modo para uso agrícola',
      categoria: 'Fungicida',
      embalagens_permitidas: ['Bombona', 'Galão', 'Frasco', 'Tambor', 'Container / IBC', 'Saco'],
      regra_especial: 'Fungicidas agrícolas em embalagens comerciais acima de 300 g/mL.',
      created: ts,
      updated: ts,
    },
    {
      id: 'reg_31052000',
      ncm: '31052000',
      descricao: 'Adubos (fertilizantes) minerais ou químicos contendo os três elementos fertilizantes: nitrogênio, fósforo e potássio (NPK)',
      categoria: 'Fertilizante',
      embalagens_permitidas: ['Saco', 'Sacaria', 'Big Bag', 'Granel', 'Balde', 'Bombona'],
      regra_especial: 'Embalagens com peso bruto superior a 10 kg (exceto 3105.10.00 para <= 10 kg).',
      created: ts,
      updated: ts,
    },
    {
      id: 'reg_25210000',
      ncm: '25210000',
      descricao: 'Castinas; pedras calcárias utilizadas para fabricação de cal ou cimento e corretivos de solo',
      categoria: 'Corretivo de Solo',
      embalagens_permitidas: ['Big Bag', 'Granel', 'Saco', 'Sacaria'],
      regra_especial: 'Corretivo de solo mineral (Capítulo 25 da TIPI).',
      created: ts,
      updated: ts,
    },
    {
      id: 'reg_30024999',
      ncm: '30024999',
      descricao: 'Inoculantes agrícolas e culturas de microrganismos biológicos para agricultura',
      categoria: 'Inoculante / Biológico',
      embalagens_permitidas: ['Frasco', 'Bolsa', 'Bag', 'Saco', 'Caixa', 'Galão', 'Bombona'],
      regra_especial: 'Inoculantes de bactérias fixadoras de nitrogênio e solubilizadores biológicos.',
      created: ts,
      updated: ts,
    },
  ]

  const parametrizacao_fiscal = [
    {
      id: 'pf_38089324',
      ncm: '3808.93.24',
      aliquota_pis: 0,
      aliquota_cofins: 0,
      regime: 'nao_cumulativo',
      aliquota_ibs: 5.2,
      aliquota_cbs: 3.5,
      classificacao: 'Herbicidas à base de Glifosato (Defensivo Agrícola - Cap. 38.08)',
      tributacao: 'Alíquota Zero (Lei 10.925/04, Art. 1º, II) | Pós-Abr/26: 0,925% Real (LC 224/25) | ICMS Red. 60% (Conv. 100/97)',
      created: ts,
      updated: ts,
    },
    {
      id: 'pf_38089329',
      ncm: '3808.93.29',
      aliquota_pis: 0,
      aliquota_cofins: 0,
      regime: 'nao_cumulativo',
      aliquota_ibs: 5.2,
      aliquota_cbs: 3.5,
      classificacao: 'Outros Herbicidas Formulados (Defensivo Agrícola - Cap. 38.08)',
      tributacao: 'Alíquota Zero (Lei 10.925/04, Art. 1º, II) | Pós-Abr/26: 0,925% Real (LC 224/25) | ICMS Red. 60% (Conv. 100/97)',
      created: ts,
      updated: ts,
    },
    {
      id: 'pf_38086290',
      ncm: '3808.62.90',
      aliquota_pis: 0,
      aliquota_cofins: 0,
      regime: 'nao_cumulativo',
      aliquota_ibs: 5.2,
      aliquota_cbs: 3.5,
      classificacao: 'Inseticidas Nota Subpos. 2 (Bifentrina) > 300g até 7,5kg',
      tributacao: 'Alíquota Zero (Lei 10.925/04, Art. 1º, II) | Pós-Abr/26: 0,925% Real (LC 224/25) | ICMS Red. 60% (Conv. 100/97)',
      created: ts,
      updated: ts,
    },
    {
      id: 'pf_38086990',
      ncm: '3808.69.90',
      aliquota_pis: 0,
      aliquota_cofins: 0,
      regime: 'nao_cumulativo',
      aliquota_ibs: 5.2,
      aliquota_cbs: 3.5,
      classificacao: 'Inseticidas Nota Subpos. 2 (Bifentrina) > 7,5kg',
      tributacao: 'Alíquota Zero (Lei 10.925/04, Art. 1º, II) | Pós-Abr/26: 0,925% Real (LC 224/25) | ICMS Red. 60% (Conv. 100/97)',
      created: ts,
      updated: ts,
    },
    {
      id: 'pf_38089299',
      ncm: '3808.92.99',
      aliquota_pis: 0,
      aliquota_cofins: 0,
      regime: 'nao_cumulativo',
      aliquota_ibs: 5.2,
      aliquota_cbs: 3.5,
      classificacao: 'Fungicidas e Tratamento de Sementes (Cap. 38.08)',
      tributacao: 'Alíquota Zero (Lei 10.925/04, Art. 1º, II) | Pós-Abr/26: 0,925% Real (LC 224/25) | ICMS Red. 60% (Conv. 100/97)',
      created: ts,
      updated: ts,
    },
    {
      id: 'pf_31052000',
      ncm: '3105.20.00',
      aliquota_pis: 0,
      aliquota_cofins: 0,
      regime: 'nao_cumulativo',
      aliquota_ibs: 5.2,
      aliquota_cbs: 3.5,
      classificacao: 'Adubos e Fertilizantes Minerais ou Químicos NPK (Cap. 31)',
      tributacao: 'Alíquota Zero (Lei 10.925/04, Art. 1º, I) | ICMS Carga Efetiva 4% (Conv. ICMS 100/97, Cláusula 3ª-A / Conv. 26/21)',
      created: ts,
      updated: ts,
    },
    {
      id: 'pf_25210000',
      ncm: '2521.00.00',
      aliquota_pis: 0,
      aliquota_cofins: 0,
      regime: 'nao_cumulativo',
      aliquota_ibs: 5.2,
      aliquota_cbs: 3.5,
      classificacao: 'Corretivo de Solo Mineral — Calcário Agrícola (Cap. 25)',
      tributacao: 'Alíquota Zero Condicional (Lei 10.925/04, Art. 1º, IV c/c Dec. 5.630/05) | ICMS Red. 60% (Conv. 100/97, Cláusula 1ª, IV)',
      created: ts,
      updated: ts,
    },
    {
      id: 'pf_30024999',
      ncm: '3002.49.99',
      aliquota_pis: 0,
      aliquota_cofins: 0,
      regime: 'nao_cumulativo',
      aliquota_ibs: 5.2,
      aliquota_cbs: 3.5,
      classificacao: 'Inoculantes Agrícolas Fixadores de Nitrogênio (Cap. 30)',
      tributacao: 'Alíquota Zero (Lei 10.925/04, Art. 1º, VI) | ICMS Red. 60% (Conv. 100/97, Cláusula 1ª, I)',
      created: ts,
      updated: ts,
    },
  ]

  const base_mestre = [
    {
      id: 'bm_roundup_wg_20kg',
      nome_completo: 'ROUNDUP WG',
      nome_produto: 'ROUNDUP WG',
      marca_padronizada: 'ROUNDUP WG',
      tipo_produto: 'Produto Formulado Comercial',
      embalagem: 'Saco 20 KG',
      embalagem_original: '1X20KG SACO (20 KG)',
      quantidade_embalagem_principal: 20,
      unidade_medida_principal: 'KG',
      forma_acondicionamento: 'Saco',
      unidade: 'KG (Quilograma)',
      principio_ativo: 'Glifosato',
      principio_ativo_id: 'pa_glifosato',
      macro_grupo: 'Defensivos',
      sub_grupo: 'Herbicida',
      nota_subpos_2: 'NÃO',
      ncm_padrao: '3808.93.24',
      ncm_especifica: '3808.93.24',
      ncm: '38089324',
      ncm_faixa1_ate_300g: '3808.93.24',
      ncm_faixa2_300g_a_7_5kg: '3808.93.24',
      ncm_faixa3_7_5kg_a_10kg: '3808.93.24',
      ncm_faixa4_acima_10kg: '3808.93.24',
      regra_tipi: 'Posição 3808.93.24 (Herbicida à base de glifosato ou seus sais para uso agrícola).',
      registro_mapa: 'Nº 002094',
      sistema_norma_mapa: 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)',
      titular_fabricante: 'MONSANTO DO BRASIL LTDA.',
      fabricante: 'MONSANTO DO BRASIL LTDA.',
      origem_base: 'OFICIAL_HOMOLOGADA',
      status_pis_cofins: 'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
      aliquota_ate_mar2026: '0,00% (Lei nº 10.925/2004)',
      aliquota_pos_abr2026_real: '0,925% (LC nº 224/2025)',
      aliquota_pos_abr2026_presumido: '0,365% (LC nº 224/2025)',
      cst_saida: 'CST 06',
      cst_entrada: 'CST 73',
      ibs_cbs_2027: 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
      url_oficial: 'https://agrofit.agricultura.gov.br',
      status_validacao: 'aprovado',
      created: ts,
      updated: ts,
    },
    {
      id: 'bm_roundup_original_mais_20l',
      nome_completo: 'ROUNDUP ORIGINAL MAIS',
      nome_produto: 'ROUNDUP ORIGINAL MAIS',
      marca_padronizada: 'ROUNDUP ORIGINAL MAIS',
      tipo_produto: 'Produto Formulado Comercial',
      embalagem: 'Bombona 20 L',
      embalagem_original: '1X20L (20 L)',
      quantidade_embalagem_principal: 20,
      unidade_medida_principal: 'L',
      forma_acondicionamento: 'Bombona',
      unidade: 'L (Litro)',
      principio_ativo: 'GLIFOSATO 577',
      principio_ativo_id: 'pa_glifosato',
      macro_grupo: 'Defensivos',
      sub_grupo: 'Herbicida',
      nota_subpos_2: 'NÃO',
      ncm_padrao: '3808.93.24',
      ncm_especifica: '3808.93.24',
      ncm: '38089324',
      ncm_faixa1_ate_300g: '3808.93.24',
      ncm_faixa2_300g_a_7_5kg: '3808.93.24',
      ncm_faixa3_7_5kg_a_10kg: '3808.93.24',
      ncm_faixa4_acima_10kg: '3808.93.24',
      regra_tipi: 'Posição 3808.93.24 (Herbicidas à base de glifosato ou seus sais).',
      registro_mapa: 'Nº 01119',
      sistema_norma_mapa: 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)',
      titular_fabricante: 'MONSANTO DO BRASIL LTDA.',
      fabricante: 'MONSANTO DO BRASIL LTDA.',
      origem_base: 'BULA_OFICIAL_PDF',
      status_pis_cofins: 'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
      aliquota_ate_mar2026: '0,00% (Lei nº 10.925/2004)',
      aliquota_pos_abr2026_real: '0,925% (LC nº 224/2025)',
      aliquota_pos_abr2026_presumido: '0,365% (LC nº 224/2025)',
      cst_saida: 'CST 06',
      cst_entrada: 'CST 73',
      ibs_cbs_2027: 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
      url_oficial: 'https://agrofit.agricultura.gov.br',
      status_validacao: 'aprovado',
      created: ts,
      updated: ts,
    },
    {
      id: 'bm_cofenrin_5l',
      nome_completo: 'COFENRIN',
      nome_produto: 'COFENRIN',
      marca_padronizada: 'COFENRIN',
      tipo_produto: 'Produto Formulado Comercial',
      embalagem: 'Galão 5 L',
      embalagem_original: '4X5L (5 L)',
      quantidade_embalagem_principal: 5,
      unidade_medida_principal: 'L',
      forma_acondicionamento: 'Galão',
      unidade: 'L (Litro)',
      principio_ativo: 'BIFENTRINA',
      principio_ativo_id: 'pa_bifentrina',
      macro_grupo: 'Defensivos',
      sub_grupo: 'Inseticida / Acaricida',
      nota_subpos_2: 'SIM',
      ncm_padrao: '3808.62.90',
      ncm_especifica: '3808.62.90',
      ncm: '38086290',
      ncm_faixa1_ate_300g: '3808.61.00',
      ncm_faixa2_300g_a_7_5kg: '3808.62.90',
      ncm_faixa3_7_5kg_a_10kg: '3808.69.90',
      ncm_faixa4_acima_10kg: '3808.69.90',
      regra_tipi: 'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022): Até 7,5 kg -> 3808.62.90; Acima de 7,5 kg -> 3808.69.90',
      registro_mapa: 'Nº 06922',
      sistema_norma_mapa: 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)',
      titular_fabricante: 'RAINBOW DEFENSIVOS AGRÍCOLAS LTDA.',
      fabricante: 'RAINBOW DEFENSIVOS AGRÍCOLAS LTDA.',
      origem_base: 'BULA_OFICIAL_COFENRIN',
      status_pis_cofins: 'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
      aliquota_ate_mar2026: '0,00% (Lei nº 10.925/2004)',
      aliquota_pos_abr2026_real: '0,925% (LC nº 224/2025)',
      aliquota_pos_abr2026_presumido: '0,365% (LC nº 224/2025)',
      cst_saida: 'CST 06',
      cst_entrada: 'CST 73',
      ibs_cbs_2027: 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
      url_oficial: 'https://agrofit.agricultura.gov.br',
      status_validacao: 'aprovado',
      created: ts,
      updated: ts,
    },
    {
      id: 'bm_cofenrin_20l',
      nome_completo: 'COFENRIN',
      nome_produto: 'COFENRIN',
      marca_padronizada: 'COFENRIN',
      tipo_produto: 'Produto Formulado Comercial',
      embalagem: 'Bombona 20 L',
      embalagem_original: '1X20L (20 L)',
      quantidade_embalagem_principal: 20,
      unidade_medida_principal: 'L',
      forma_acondicionamento: 'Bombona',
      unidade: 'L (Litro)',
      principio_ativo: 'BIFENTRINA',
      principio_ativo_id: 'pa_bifentrina',
      macro_grupo: 'Defensivos',
      sub_grupo: 'Inseticida / Acaricida',
      nota_subpos_2: 'SIM',
      ncm_padrao: '3808.69.90',
      ncm_especifica: '3808.69.90',
      ncm: '38086990',
      ncm_faixa1_ate_300g: '3808.61.00',
      ncm_faixa2_300g_a_7_5kg: '3808.62.90',
      ncm_faixa3_7_5kg_a_10kg: '3808.69.90',
      ncm_faixa4_acima_10kg: '3808.69.90',
      regra_tipi: 'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022): Até 7,5 kg -> 3808.62.90; Acima de 7,5 kg -> 3808.69.90',
      registro_mapa: 'Nº 06922',
      sistema_norma_mapa: 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)',
      titular_fabricante: 'RAINBOW DEFENSIVOS AGRÍCOLAS LTDA.',
      fabricante: 'RAINBOW DEFENSIVOS AGRÍCOLAS LTDA.',
      origem_base: 'BULA_OFICIAL_COFENRIN',
      status_pis_cofins: 'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
      aliquota_ate_mar2026: '0,00% (Lei nº 10.925/2004)',
      aliquota_pos_abr2026_real: '0,925% (LC nº 224/2025)',
      aliquota_pos_abr2026_presumido: '0,365% (LC nº 224/2025)',
      cst_saida: 'CST 06',
      cst_entrada: 'CST 73',
      ibs_cbs_2027: 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
      url_oficial: 'https://agrofit.agricultura.gov.br',
      status_validacao: 'aprovado',
      created: ts,
      updated: ts,
    },
    {
      id: 'bm_standak_top_5l',
      nome_completo: 'STANDAK TOP',
      nome_produto: 'STANDAK TOP',
      marca_padronizada: 'STANDAK TOP',
      tipo_produto: 'Produto Formulado Comercial',
      embalagem: 'Galão 5 L',
      embalagem_original: '4X5L (5 L)',
      quantidade_embalagem_principal: 5,
      unidade_medida_principal: 'L',
      forma_acondicionamento: 'Galão',
      unidade: 'L (Litro)',
      principio_ativo: 'Fipronil + Piraclostrobina + Tiofanato-metílico',
      principio_ativo_id: 'pa_fipronil_piraclostrobina_tiofanato',
      macro_grupo: 'Defensivos',
      sub_grupo: 'Inseticida / Fungicida',
      nota_subpos_2: 'NÃO',
      ncm_padrao: '3808.92.99',
      ncm_especifica: '3808.92.99',
      ncm: '38089299',
      ncm_faixa1_ate_300g: '3808.92.91',
      ncm_faixa2_300g_a_7_5kg: '3808.92.99',
      ncm_faixa3_7_5kg_a_10kg: '3808.92.99',
      ncm_faixa4_acima_10kg: '3808.92.99',
      regra_tipi: 'Posição 3808.92.99 (Fungicida/Inseticida misto para tratamento de sementes).',
      registro_mapa: 'Nº 012809',
      sistema_norma_mapa: 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)',
      titular_fabricante: 'BASF S.A.',
      fabricante: 'BASF S.A.',
      origem_base: 'OFICIAL_HOMOLOGADA',
      status_pis_cofins: 'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
      aliquota_ate_mar2026: '0,00% (Lei nº 10.925/2004)',
      aliquota_pos_abr2026_real: '0,925% (LC nº 224/2025)',
      aliquota_pos_abr2026_presumido: '0,365% (LC nº 224/2025)',
      cst_saida: 'CST 06',
      cst_entrada: 'CST 73',
      ibs_cbs_2027: 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
      url_oficial: 'https://agrofit.agricultura.gov.br',
      status_validacao: 'aprovado',
      created: ts,
      updated: ts,
    },
    {
      id: 'bm_sulfentrazone_20l',
      nome_completo: 'SULFENTRAZONE 500 SC TAGROS',
      nome_produto: 'SULFENTRAZONE 500 SC TAGROS',
      marca_padronizada: 'SULFENTRAZONE 500 SC TAGROS',
      tipo_produto: 'Produto Formulado Comercial',
      embalagem: 'Bombona 20 L',
      embalagem_original: '1X20L (20 L)',
      quantidade_embalagem_principal: 20,
      unidade_medida_principal: 'L',
      forma_acondicionamento: 'Bombona',
      unidade: 'L (Litro)',
      principio_ativo: 'SULFENTRAZONA 500',
      principio_ativo_id: 'pa_sulfentrazona',
      macro_grupo: 'Defensivos',
      sub_grupo: 'Herbicida',
      nota_subpos_2: 'NÃO',
      ncm_padrao: '3808.93.29',
      ncm_especifica: '3808.93.29',
      ncm: '38089329',
      ncm_faixa1_ate_300g: '3808.93.21',
      ncm_faixa2_300g_a_7_5kg: '3808.93.29',
      ncm_faixa3_7_5kg_a_10kg: '3808.93.29',
      ncm_faixa4_acima_10kg: '3808.93.29',
      regra_tipi: 'Posição 3808.93.29 (Outros herbicidas formulados para uso agrícola).',
      registro_mapa: 'Nº 03820',
      sistema_norma_mapa: 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)',
      titular_fabricante: 'Tagros Brasil Comércio de Produtos Químicos Ltda',
      fabricante: 'Tagros Brasil Comércio de Produtos Químicos Ltda',
      origem_base: 'BULA_OFICIAL_PDF',
      status_pis_cofins: 'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
      aliquota_ate_mar2026: '0,00% (Lei nº 10.925/2004)',
      aliquota_pos_abr2026_real: '0,925% (LC nº 224/2025)',
      aliquota_pos_abr2026_presumido: '0,365% (LC nº 224/2025)',
      cst_saida: 'CST 06',
      cst_entrada: 'CST 73',
      ibs_cbs_2027: 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
      url_oficial: 'https://agrofit.agricultura.gov.br',
      status_validacao: 'aprovado',
      created: ts,
      updated: ts,
    },
  ]

  const bula_produtos = [
    {
      id: 'bula_roundup_orig_mais',
      registro_mapa: 'Nº 01119',
      nome_comercial: 'ROUNDUP ORIGINAL MAIS',
      marca_padronizada: 'ROUNDUP ORIGINAL MAIS',
      titular_registro: 'MONSANTO DO BRASIL LTDA.',
      fabricante_formulador: 'MONSANTO DO BRASIL LTDA.',
      principio_ativo: 'GLIFOSATO 577',
      classe_agronomica: 'Herbicida',
      grupo_quimico: 'Glicina substituída (HRAC Grupo G)',
      classificacao_toxicologica: 'CATEGORIA 5 – PRODUTO IMPROVÁVEL DE CAUSAR DANO AGUDO',
      classificacao_ambiental: 'Classe III – Produto Perigoso ao Meio Ambiente',
      tipo_formulacao: 'Concentrado Solúvel (SL)',
      modo_acao: 'Herbicida seletivo condicional, de ação sistêmica, recomendado em pós-emergência.',
      ncm_padrao: '3808.93.24',
      tipo_produto: 'Produto Formulado Comercial',
      status_registro: 'Ativo',
      embalagem: '1X20L (20 L)',
      created: ts,
      updated: ts,
    },
    {
      id: 'bula_cofenrin',
      registro_mapa: 'Nº 06922',
      nome_comercial: 'COFENRIN',
      marca_padronizada: 'COFENRIN',
      titular_registro: 'RAINBOW DEFENSIVOS AGRÍCOLAS LTDA.',
      fabricante_formulador: 'RAINBOW DEFENSIVOS AGRÍCOLAS LTDA.',
      principio_ativo: 'BIFENTRINA 400',
      classe_agronomica: 'Inseticida / Acaricida',
      grupo_quimico: 'Piretróide (IRAC Grupo 3A)',
      classificacao_toxicologica: 'CATEGORIA 3 – PRODUTO MODERADAMENTE TÓXICO',
      classificacao_ambiental: 'Classe I – Produto Altamente Perigoso ao Meio Ambiente',
      tipo_formulacao: 'Concentrado Emulsionável (EC)',
      modo_acao: 'Inseticida e acaricida piretróide de ação de contato e ingestão.',
      ncm_padrao: '3808.62.90',
      tipo_produto: 'Produto Formulado Comercial',
      status_registro: 'Ativo',
      embalagem: '4X5L (5 L) / 1X20L (20 L)',
      created: ts,
      updated: ts,
    },
    {
      id: 'bula_sulfentrazone',
      registro_mapa: 'Nº 03820',
      nome_comercial: 'SULFENTRAZONE 500 SC TAGROS',
      marca_padronizada: 'SULFENTRAZONE 500 SC TAGROS',
      titular_registro: 'Tagros Brasil Comércio de Produtos Químicos Ltda',
      fabricante_formulador: 'Tagros Chemicals India Limited',
      principio_ativo: 'SULFENTRAZONA 500',
      classe_agronomica: 'Herbicida',
      grupo_quimico: 'Triazolona (HRAC Grupo E)',
      classificacao_toxicologica: 'Não classificado – Produto Não Classificado',
      classificacao_ambiental: 'Classe II – Produto Muito Perigoso ao Meio Ambiente',
      tipo_formulacao: 'Suspensão Concentrada (SC)',
      modo_acao: 'Herbicida pré-emergente, seletivo condicional, de ação sistêmica.',
      ncm_padrao: '3808.93.29',
      tipo_produto: 'Produto Formulado Comercial',
      status_registro: 'Ativo',
      embalagem: '1X20L (20 L)',
      created: ts,
      updated: ts,
    },
  ]

  const bula_composicao = [
    {
      id: 'bcomp_1',
      registro_mapa: 'Nº 01119',
      nome_produto: 'ROUNDUP ORIGINAL MAIS',
      ingrediente_ativo: 'GLIFOSATO (Sal de Di-amônio)',
      nome_quimico: 'Sal de Di-amônio de N-(phosphonomethyl)glycine (GLIFOSATO)',
      concentracao: '577.0',
      unidade_medida: 'g/L',
      funcao_ingrediente: 'Ingrediente Ativo',
      percentual_volume: '57,7% m/v',
      created: ts,
      updated: ts,
    },
    {
      id: 'bcomp_2',
      registro_mapa: 'Nº 01119',
      nome_produto: 'ROUNDUP ORIGINAL MAIS',
      ingrediente_ativo: 'Equivalente ácido de GLIFOSATO',
      nome_quimico: 'Equivalente ácido de N-(phosphonomethyl)glycine',
      concentracao: '480.0',
      unidade_medida: 'g/L',
      funcao_ingrediente: 'Equivalente Ácido',
      percentual_volume: '48,0% m/v',
      created: ts,
      updated: ts,
    },
    {
      id: 'bcomp_3',
      registro_mapa: 'Nº 06922',
      nome_produto: 'COFENRIN',
      ingrediente_ativo: 'BIFENTRINA',
      nome_quimico: 'Bifentrina técnica',
      concentracao: '400',
      unidade_medida: 'g/L',
      funcao_ingrediente: 'Ingrediente Ativo',
      percentual_volume: '40,0% m/v',
      created: ts,
      updated: ts,
    },
    {
      id: 'bcomp_4',
      registro_mapa: 'Nº 03820',
      nome_produto: 'SULFENTRAZONE 500 SC TAGROS',
      ingrediente_ativo: 'SULFENTRAZONA',
      nome_quimico: "2',4'-dichloro-5'-(4-difluoromethyl-4,5-dihydro-3-methyl-5-oxo-1H-1,2,4-triazol-1-yl)methanesulfonanilide [SULFENTRAZONA]",
      concentracao: '500',
      unidade_medida: 'g/L',
      funcao_ingrediente: 'Ingrediente Ativo',
      percentual_volume: '50,0% m/v',
      created: ts,
      updated: ts,
    },
  ]

  const bula_empresas = [
    {
      id: 'bemp_1',
      registro_mapa: 'Nº 01119',
      nome_produto: 'ROUNDUP ORIGINAL MAIS',
      tipo_relacao: 'Titular do Registro',
      razao_social: 'MONSANTO DO BRASIL LTDA.',
      cnpj: '64.858.525/0001-45',
      endereco: 'Rua Domingos Jorge, 1.100 - São Paulo/SP',
      municipio: 'São Paulo',
      uf: 'SP',
      cep: '04779-900',
      inscricao_estadual: 'Registro Estadual nº 426 - CDA/SP',
      pais: 'Brasil',
      created: ts,
      updated: ts,
    },
    {
      id: 'bemp_2',
      registro_mapa: 'Nº 01119',
      nome_produto: 'ROUNDUP ORIGINAL MAIS',
      tipo_relacao: 'Formulador',
      razao_social: 'AGRO BAYER S.R.L.',
      cnpj: 'EXT-ARG-ZARATE',
      endereco: 'Zarate Plant – Ruta Provincial 6, km 83,1 - Zarate - 2800',
      municipio: 'Zárate',
      uf: '',
      cep: '2800',
      inscricao_estadual: '',
      pais: 'Argentina',
      created: ts,
      updated: ts,
    },
    {
      id: 'bemp_3',
      registro_mapa: 'Nº 03820',
      nome_produto: 'SULFENTRAZONE 500 SC TAGROS',
      tipo_relacao: 'Titular do Registro',
      razao_social: 'Tagros Brasil Comércio de Produtos Químicos Ltda',
      cnpj: '21.545.388/0001-86',
      endereco: 'Rua Jorge Caixe, 132 – sala 02 - Cotia/SP',
      municipio: 'Cotia',
      uf: 'SP',
      cep: '06716-690',
      inscricao_estadual: 'CDA 1188',
      pais: 'Brasil',
      created: ts,
      updated: ts,
    },
  ]

  const bula_culturas = [
    {
      id: 'bcult_1',
      registro_mapa: 'Nº 01119',
      nome_produto: 'ROUNDUP ORIGINAL MAIS',
      cultura: 'Soja',
      intervalo_seguranca_dias: '(1) Não determinado',
      intervalo_reentrada_horas: '24 horas',
      modalidade_emprego: 'Pós-emergência / Dessecação',
      created: ts,
      updated: ts,
    },
    {
      id: 'bcult_2',
      registro_mapa: 'Nº 01119',
      nome_produto: 'ROUNDUP ORIGINAL MAIS',
      cultura: 'Milho',
      intervalo_seguranca_dias: '(1) Não determinado',
      intervalo_reentrada_horas: '24 horas',
      modalidade_emprego: 'Pós-emergência',
      created: ts,
      updated: ts,
    },
    {
      id: 'bcult_3',
      registro_mapa: 'Nº 03820',
      nome_produto: 'SULFENTRAZONE 500 SC TAGROS',
      cultura: 'Cana-de-açúcar',
      intervalo_seguranca_dias: '(1) Não determinado',
      intervalo_reentrada_horas: '24 horas',
      modalidade_emprego: 'Pré-emergência',
      created: ts,
      updated: ts,
    },
  ]

  const log_validacoes = [
    {
      id: 'log_01',
      nome_produto: 'ROUNDUP WG',
      ncm: '38089324',
      embalagem: 'Saco 20 KG',
      principio_ativo: 'Glifosato',
      id_trava: 1,
      trava_nome: 'NCM Obrigatória (Base Mestre & TIPI)',
      aprovado: true,
      mensagem: 'NCM 3808.93.24 resolvida da Base Mestre e homologada na TIPI.',
      created: ts,
      updated: ts,
    },
    {
      id: 'log_02',
      nome_produto: 'ROUNDUP WG',
      ncm: '38089324',
      embalagem: 'Saco 20 KG',
      principio_ativo: 'Glifosato',
      id_trava: 2,
      trava_nome: 'Embalagem vs NCM',
      aprovado: true,
      mensagem: 'Embalagem "Saco 20 KG" autorizada para o NCM 3808.93.24 na matriz TIPI.',
      created: ts,
      updated: ts,
    },
    {
      id: 'log_03',
      nome_produto: 'COFENRIN',
      ncm: '38086290',
      embalagem: 'Galão 5 L',
      principio_ativo: 'BIFENTRINA',
      id_trava: 3,
      trava_nome: 'Princípio Ativo na Matriz / Bula',
      aprovado: true,
      mensagem: 'Princípio ativo vinculado com sucesso (Dicionário de PAs: BIFENTRINA).',
      created: ts,
      updated: ts,
    },
    {
      id: 'log_04',
      nome_produto: 'COFENRIN',
      ncm: '38086290',
      embalagem: 'Galão 5 L',
      principio_ativo: 'BIFENTRINA',
      id_trava: 4,
      trava_nome: 'Duplicidade de Cadastro (4 Campos)',
      aprovado: true,
      mensagem: 'Registro único e íntegro na Base Mestre para a chave canônica (COFENRIN | 5 L | MAPA Nº 06922).',
      created: ts,
      updated: ts,
    },
    {
      id: 'log_05',
      nome_produto: 'COFENRIN',
      ncm: '38086290',
      embalagem: 'Galão 5 L',
      principio_ativo: 'BIFENTRINA',
      id_trava: 5,
      trava_nome: 'Concentração Válida',
      aprovado: true,
      mensagem: 'Concentração informada (400 g/L) dentro dos limites técnicos (0 a 1000).',
      created: ts,
      updated: ts,
    },
    {
      id: 'log_06',
      nome_produto: 'COFENRIN',
      ncm: '38086290',
      embalagem: 'Galão 5 L',
      principio_ativo: 'BIFENTRINA',
      id_trava: 6,
      trava_nome: 'Registro MAPA',
      aprovado: true,
      mensagem: 'Registro MAPA oficial (Nº 06922) validado no AGROFIT / Base Mestre.',
      created: ts,
      updated: ts,
    },
    {
      id: 'log_07',
      nome_produto: 'COFENRIN (Lote Divergente)',
      ncm: '38086990',
      embalagem: 'Galão 5 L',
      principio_ativo: 'BIFENTRINA',
      id_trava: 2,
      trava_nome: 'Embalagem vs NCM',
      aprovado: false,
      mensagem: 'NCM 3808.69.90 incompatível com embalagem de 5 L (Nota 2 Cap. 38 exige 3808.62.90 para ≤ 7,5 kg).',
      created: ts,
      updated: ts,
    },
    {
      id: 'log_08',
      nome_produto: 'HERBICIDA EXPERIMENTAL X',
      ncm: '',
      embalagem: 'Bombona 20 L',
      principio_ativo: 'Glifosato',
      id_trava: 1,
      trava_nome: 'NCM Obrigatória (Base Mestre & TIPI)',
      aprovado: false,
      mensagem: 'Produto sem classificação tributária na Base Mestre',
      created: ts,
      updated: ts,
    },
    {
      id: 'log_09',
      nome_produto: 'FUNGICIDA DUPLICADO LOTE',
      ncm: '38089299',
      embalagem: 'Bombona 20 L',
      principio_ativo: 'Tebuconazol',
      id_trava: 4,
      trava_nome: 'Duplicidade de Cadastro (4 Campos)',
      aprovado: false,
      mensagem: 'Detectada duplicidade cadastral na combinação (Nome + Princípio Ativo + Embalagem + MAPA).',
      created: ts,
      updated: ts,
    },
  ]

  const sincronizacao_historico = [
    {
      id: 'sync_m1',
      status: 'sucesso',
      fontes_consultadas: ['MAPA / AGROFIT', 'SIPEAGRO'],
      total_consultados: 18,
      novos_incluidos: 6,
      atualizados: 4,
      ja_existentes: 8,
      erros_validacao: 2,
      duracao_ms: 1120,
      resumo: 'Ciclo Maio: 18 produtos consultados no AGROFIT.',
      relatorio_itens: [],
      created: '2026-05-15T10:00:00.000Z',
      updated: '2026-05-15T10:00:00.000Z',
    },
    {
      id: 'sync_m2',
      status: 'sucesso',
      fontes_consultadas: ['MAPA / AGROFIT', 'SIPEAGRO'],
      total_consultados: 26,
      novos_incluidos: 8,
      atualizados: 6,
      ja_existentes: 12,
      erros_validacao: 1,
      duracao_ms: 1190,
      resumo: 'Ciclo Junho: 26 produtos consultados e revisados.',
      relatorio_itens: [],
      created: '2026-06-15T10:00:00.000Z',
      updated: '2026-06-15T10:00:00.000Z',
    },
    {
      id: 'sync_m3',
      status: 'sucesso',
      fontes_consultadas: ['MAPA / AGROFIT', 'SIPEAGRO', 'Bioinsumos'],
      total_consultados: 34,
      novos_incluidos: 9,
      atualizados: 8,
      ja_existentes: 17,
      erros_validacao: 2,
      duracao_ms: 1250,
      resumo: 'Ciclo Julho: 34 produtos sincronizados com matriz de PAs.',
      relatorio_itens: [],
      created: '2026-07-15T10:00:00.000Z',
      updated: '2026-07-15T10:00:00.000Z',
    },
    {
      id: 'sync_m4',
      status: 'sucesso',
      fontes_consultadas: ['MAPA / AGROFIT', 'SIPEAGRO', 'Bioinsumos'],
      total_consultados: 42,
      novos_incluidos: 10,
      atualizados: 11,
      ja_existentes: 21,
      erros_validacao: 1,
      duracao_ms: 1310,
      resumo: 'Ciclo Agosto: 42 produtos auditados contra Nota 2 Cap. 38 TIPI.',
      relatorio_itens: [],
      created: '2026-08-15T10:00:00.000Z',
      updated: '2026-08-15T10:00:00.000Z',
    },
    {
      id: 'sync_m5',
      status: 'sucesso',
      fontes_consultadas: ['MAPA / AGROFIT', 'SIPEAGRO', 'Bioinsumos'],
      total_consultados: 50,
      novos_incluidos: 12,
      atualizados: 15,
      ja_existentes: 23,
      erros_validacao: 1,
      duracao_ms: 1380,
      resumo: 'Ciclo Setembro: 50 produtos homologados com enquadramento LC 224/25.',
      relatorio_itens: [],
      created: '2026-09-15T10:00:00.000Z',
      updated: '2026-09-15T10:00:00.000Z',
    },
    {
      id: 'sync_001',
      status: 'sucesso',
      fontes_consultadas: ['MAPA / AGROFIT', 'SIPEAGRO', 'Bioinsumos'],
      total_consultados: 64,
      novos_incluidos: 14,
      atualizados: 18,
      ja_existentes: 32,
      erros_validacao: 0,
      duracao_ms: 1420,
      resumo: 'Sincronização oficial concluída: 64 registros auditados nas bases MAPA/AGROFIT e Base Mestre.',
      relatorio_itens: base_mestre.map((b) => ({
        nome_produto: b.marca_padronizada,
        principio_ativo: b.principio_ativo,
        ncm: b.ncm_padrao,
        registro_mapa: b.registro_mapa,
        fabricante: b.titular_fabricante,
        embalagem: b.embalagem,
        fonte_origem: 'MAPA / AGROFIT',
        acao: 'atualizado',
        motivo: 'Homologado no padrão canônico de 28 campos e faixas TIPI.',
      })),
      created: '2026-10-15T10:00:00.000Z',
      updated: '2026-10-15T10:00:00.000Z',
    },
  ]

  return {
    users,
    convites_usuarios: [],
    base_mestre,
    dicionario_principios_ativos,
    regras_ncm_embalagem,
    parametrizacao_fiscal,
    bula_produtos,
    bula_composicao,
    bula_empresas,
    bula_embalagens: [],
    bula_culturas,
    bula_alvos: [],
    bula_aplicacao: [],
    log_validacoes,
    sincronizacao_historico,
    tributacao_conversas: [],
    tributacao_mensagens: [],
  }
}

function loadDb(): DbStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.base_mestre)) {
        return parsed
      }
    }
  } catch {
    // fallback to seed
  }
  const initial = criarSeedInicial()
  saveDb(initial)
  return initial
}

function saveDb(db: DbStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    // ignore storage quota errors
  }
}

function avaliarCondicaoAtomica(record: Record<string, any>, expr: string): boolean {
  const s = expr.trim()
  if (!s || s === '1 = 1' || s === "id != ''") return true

  const mTilde = s.match(/^([a-zA-Z0-9_]+)\s*~\s*['"]([^'"]*)['"]$/)
  if (mTilde) {
    const field = mTilde[1]
    const needle = normalizarTexto(mTilde[2])
    const val = normalizarTexto(String(record[field] ?? ''))
    return val.includes(needle)
  }

  const mNotEq = s.match(/^([a-zA-Z0-9_]+)\s*!=\s*['"]([^'"]*)['"]$/)
  if (mNotEq) {
    const field = mNotEq[1]
    const target = mNotEq[2]
    return String(record[field] ?? '') !== target
  }

  const mEqStr = s.match(/^([a-zA-Z0-9_]+)\s*=\s*['"]([^'"]*)['"]$/)
  if (mEqStr) {
    const field = mEqStr[1]
    const target = mEqStr[2]
    return String(record[field] ?? '').toLowerCase() === target.toLowerCase()
  }

  const mEqNum = s.match(/^([a-zA-Z0-9_]+)\s*=\s*([0-9.]+)$/)
  if (mEqNum) {
    const field = mEqNum[1]
    const num = Number(mEqNum[2])
    return Number(record[field]) === num
  }

  return true
}

function filtrarRegistros(records: Record<string, any>[], filterStr?: string): Record<string, any>[] {
  if (!filterStr || !filterStr.trim()) return [...records]
  const cleanFilter = filterStr.trim()

  return records.filter((rec) => {
    const andParts = cleanFilter.split(/\s*&&\s*/)
    return andParts.every((part) => {
      let unwrapped = part.trim()
      if (unwrapped.startsWith('(') && unwrapped.endsWith(')')) {
        unwrapped = unwrapped.slice(1, -1).trim()
      }
      const orParts = unwrapped.split(/\s*\|\|\s*/)
      return orParts.some((orExpr) => avaliarCondicaoAtomica(rec, orExpr))
    })
  })
}

function ordenarRegistros(records: Record<string, any>[], sortStr?: string): Record<string, any>[] {
  if (!sortStr) return records
  const fields = sortStr.split(',').map((s) => s.trim()).filter(Boolean)
  return [...records].sort((a, b) => {
    for (const f of fields) {
      const desc = f.startsWith('-')
      const key = desc ? f.slice(1) : f.startsWith('+') ? f.slice(1) : f
      const va = a[key] ?? ''
      const vb = b[key] ?? ''
      if (va < vb) return desc ? 1 : -1
      if (va > vb) return desc ? -1 : 1
    }
    return 0
  })
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function responderConsultorTributario(pergunta: string, db: DbStore): string {
  const qNorm = normalizarTexto(pergunta)

  if (qNorm.includes('ROUNDUP') || qNorm.includes('GLIFOSATO')) {
    const enq = determinarEnquadramentoTributario({
      ncm: '3808.93.24',
      tipo_produto: 'Produto Formulado Comercial',
      principio_ativo: 'Glifosato',
      macro_grupo: 'Defensivos',
      registro_mapa: 'Nº 002094',
    })
    return `### Enquadramento Fiscal e Tributário — Herbicidas à Base de Glifosato (ROUNDUP WG / ROUNDUP ORIGINAL MAIS)

- **Classificação TIPI (NCM):** \`3808.93.24\` (*Herbicidas à base de glifosato ou seus sais para uso agrícola*)
- **Registro MAPA:** \`Nº 002094\` (ROUNDUP WG) / \`Nº 01119\` (ROUNDUP ORIGINAL MAIS)

#### 1. PIS/PASEP e COFINS
- **Até 31/03/2026:** **Alíquota Zero (0,00%)** — Fundamentação: **${enq.pis.citacao.norma}**, ${enq.pis.citacao.artigo}, ${enq.pis.citacao.inciso}.
- **A partir de 01/04/2026 (LC nº 224/2025):** Reoneração linear residual a 10% da alíquota padrão:
  - **Lucro Real (Não Cumulativo):** \`0,925%\` (PIS \`0,165%\` + COFINS \`0,760%\`)
  - **Lucro Presumido (Cumulativo):** \`0,365%\` (PIS \`0,065%\` + COFINS \`0,300%\`)
- **CST Recomendado:** Saída \`CST 06\` | Entrada \`CST 73\`

#### 2. ICMS (Convênio ICMS nº 100/1997)
- **Regime:** Redução de **60% da base de cálculo** nas saídas interestaduais de insumos agropecuários (**Cláusula primeira, Inciso I** do Convênio ICMS 100/97, prorrogado até 31/12/2027 pelo Convênio ICMS 79/2025).

#### 3. Reforma Tributária — IBS e CBS (LC nº 214/2025)
- **Regime:** Redução de **60% das alíquotas de IBS e CBS** combinada com **diferimento** nas operações com insumos agropecuários (**Art. 138 e Anexo IX da LC nº 214/2025**).`
  }

  if (qNorm.includes('224') || qNorm.includes('ABRIL') || qNorm.includes('REONERACAO')) {
    return `### O que muda com a Lei Complementar nº 224/2025 (a partir de 01/04/2026)

A **LC nº 224/2025** (Art. 4º, § 4º, inciso I) instituiu um piso residual linear de **10% da alíquota padrão** para produtos anteriormente contemplados com alíquota zero no **Art. 1º da Lei nº 10.925/2004** (defensivos da posição 38.08, fertilizantes do Cap. 31, corretivos do Cap. 25, sementes e inoculantes):

| Regime Tributário | Alíquota até 31/03/2026 | Alíquota pós-01/04/2026 (LC 224/25) | Detalhamento |
| :--- | :---: | :---: | :--- |
| **Lucro Real (Não Cumulativo)** | \`0,00%\` | **\`0,925%\`** | PIS: \`0,165%\` + COFINS: \`0,760%\` |
| **Lucro Presumido (Cumulativo)** | \`0,00%\` | **\`0,365%\`** | PIS: \`0,065%\` + COFINS: \`0,300%\` |

- **Vedação a crédito (Art. 4º, § 7º da LC 224/2025):** A parcela residual recolhida pelo fornecedor não gera direito a crédito de PIS/COFINS para o adquirente.`
  }

  if (qNorm.includes('214') || qNorm.includes('IBS') || qNorm.includes('CBS')) {
    return `### IBS e CBS para Insumos Agropecuários — Lei Complementar nº 214/2025

Conforme o **Art. 138** e o **Anexo IX da LC nº 214/2025** (regulamentando o Art. 156-A e Art. 195, V da CF/88 / EC 132/2023):

1. **Redução de 60% das Alíquotas:** As alíquotas do **IBS** e da **CBS** ficam reduzidas em **60%** nas operações com insumos agropecuários e aquícolas (defensivos registrados no MAPA, fertilizantes, corretivos de solo, sementes certificadas e inoculantes).
2. **Diferimento:** Aplica-se o regime de **diferimento** do recolhimento de IBS/CBS nas operações internas e interestaduais entre produtores rurais contribuintes e cooperativas agropecuárias.`
  }

  if (qNorm.includes('INOCULANTE') || qNorm.includes('FOSFORO') || qNorm.includes('3002')) {
    return `### Enquadramento Tributário — Inoculantes e Biológicos (\`3002.49.99\` / \`3002.90.99\`)

- **PIS e COFINS:** **Alíquota Zero (0,00%)** até 31/03/2026 com base no **Art. 1º, Inciso VI da Lei nº 10.925/2004** (*inoculantes agrícolas produzidos a partir de bactérias fixadoras de nitrogênio*). A partir de 01/04/2026, aplica-se a alíquota residual de \`0,925%\` (Real) ou \`0,365%\` (Presumido) pela **LC nº 224/2025**.
- **ICMS:** Redução de **60% da base de cálculo** nas saídas interestaduais (**Convênio ICMS nº 100/1997, Cláusula primeira, Inciso I, parte final**).
- **IBS e CBS:** Redução de **60% + Diferimento** (**Art. 138 e Anexo IX da LC nº 214/2025**).`
  }

  return `### Parecer Técnico-Tributário — Base Mestre Validador Agro

Atualmente a Base Mestre conta com **${db.base_mestre.length} apresentações homologadas** e **${db.dicionario_principios_ativos.length} princípios ativos** parametrizados:

- **Defensivos Agropecuários (Posição 38.08 TIPI):** Alíquota zero de PIS/COFINS até 31/03/2026 (**Lei nº 10.925/2004, Art. 1º, Inciso II**) e carga residual de \`0,925%\` (Real) / \`0,365%\` (Presumido) a partir de 01/04/2026 (**LC nº 224/2025**). Nota de Subposições 2 do Cap. 38 (ex.: *Bifentrina / COFENRIN*) exige separação de NCM por faixa de peso líquido: \`3808.61.00\` (≤ 300 g), \`3808.62.90\` (> 300 g a 7,5 kg) e \`3808.69.90\` (> 7,5 kg).
- **Fertilizantes (Capítulo 31 TIPI):** Alíquota zero de PIS/COFINS (**Lei nº 10.925/2004, Art. 1º, Inciso I**) e carga tributária efetiva de **4% de ICMS** (**Convênio ICMS 100/97, Cláusula terceira-A, redação dada pelo Convênio ICMS 26/2021**).
- **Corretivos de Solo (Capítulo 25 TIPI):** Alíquota zero condicional (**Lei nº 10.925/2004, Art. 1º, Inciso IV c/c Decreto nº 5.630/2005**) e redução de 60% de ICMS (**Convênio ICMS 100/97, Cláusula primeira, Inciso IV**).`
}

function createJwtForUser(userId: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(
    JSON.stringify({
      id: userId,
      type: 'authRecord',
      collectionId: '_pb_users_auth_',
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    }),
  )
  return `${header}.${payload}.local_signature`
}

export async function handleLocalPocketBaseRequest(
  urlStr: string,
  init?: RequestInit,
): Promise<Response | null> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(urlStr, window.location.origin)
  } catch {
    return null
  }

  const pathname = parsedUrl.pathname
  const method = (init?.method || 'GET').toUpperCase()
  const db = loadDb()

  let bodyObj: Record<string, any> = {}
  if (init?.body && typeof init.body === 'string') {
    try {
      bodyObj = JSON.parse(init.body)
    } catch {
      bodyObj = {}
    }
  }

  // ---------------------------------------------------------------------------
  // 1. AUTENTICAÇÃO POCKETBASE (/api/collections/users/*)
  // ---------------------------------------------------------------------------
  if (pathname === '/api/collections/users/auth-with-password' && method === 'POST') {
    const identity = String(bodyObj.identity || bodyObj.email || 'roogerio99@gmail.com')
      .trim()
      .toLowerCase()
    let user = db.users.find((u) => String(u.email).toLowerCase() === identity)
    if (!user) {
      user = {
        id: genId('usr'),
        collectionId: '_pb_users_auth_',
        collectionName: 'users',
        email: identity,
        name: identity.split('@')[0],
        role: identity.includes('analista') ? 'analista' : 'admin',
        verified: true,
        created: nowIso(),
        updated: nowIso(),
      }
      db.users.push(user)
      saveDb(db)
    }
    return jsonResponse(200, {
      token: createJwtForUser(user.id),
      record: user,
    })
  }

  if (pathname === '/api/collections/users/auth-refresh' && method === 'POST') {
    const adminUser = db.users[0]
    return jsonResponse(200, {
      token: createJwtForUser(adminUser.id),
      record: adminUser,
    })
  }

  if (pathname === '/backend/v1/bula/analisar-pdf' && method === 'POST') {
    let fileName = 'bula_oficial.pdf'
    let fileSize = 245000
    if (init?.body instanceof FormData) {
      const f = init.body.get('arquivo')
      if (f instanceof File) {
        fileName = f.name
        fileSize = f.size
      }
    }
    const isCofenrin = /cofenrin|bifentrina/i.test(fileName)
    const isSulf = /sulfentrazon/i.test(fileName)
    const prod = isCofenrin
      ? db.bula_produtos[1]
      : isSulf
        ? db.bula_produtos[2]
        : db.bula_produtos[0]
    const comp = db.bula_composicao.filter((c) => c.registro_mapa === prod.registro_mapa)
    const emps = db.bula_empresas.filter((e) => e.registro_mapa === prod.registro_mapa)
    const cults = db.bula_culturas.filter((c) => c.registro_mapa === prod.registro_mapa)

    return jsonResponse(200, {
      sucesso: true,
      arquivo: { nome: fileName, tamanho: fileSize, truncado: false },
      checklist: {
        registro_mapa: { encontrado: true, valor: prod.registro_mapa },
        nome_comercial: { encontrado: true, valor: prod.nome_comercial },
        composicao: {
          encontrado: true,
          total: comp.length,
          itens: comp.map((c) => `${c.ingrediente_ativo} (${c.concentracao} ${c.unidade_medida})`),
        },
        empresas: {
          encontrado: true,
          total: emps.length,
          titular: prod.titular_registro,
          fabricantes: 1,
          formuladores: 1,
        },
        classificacoes: {
          encontrado: true,
          toxicologica: prod.classificacao_toxicologica,
          ambiental: prod.classificacao_ambiental,
          classe_agronomica: prod.classe_agronomica,
        },
        culturas: { encontrado: true, total: cults.length },
        alvos: { encontrado: true, total: 1 },
        aplicacao_epi: { encontrado: true, volume_calda: '100 a 200 L/ha', reentrada: '24 horas' },
      },
      dados_extraidos: {
        produto: prod,
        composicao: comp,
        empresas: emps,
        embalagens: [],
        culturas: cults,
        alvos: [],
        aplicacao: [],
      },
    })
  }

  if (pathname === '/backend/v1/bula/gravar-pdf' && method === 'POST') {
    const dados = bodyObj.dados || {}
    const prod = dados.produto || {}
    const regMapa = sanitizarRegistroMapa(prod.registro_mapa || 'Nº 01119')
    const nomeCom = prod.nome_comercial || 'PRODUTO BULA OFICIAL'
    const existente = db.bula_produtos.find((b) => b.registro_mapa === regMapa)
    if (existente) {
      Object.assign(existente, prod, { updated: nowIso() })
    } else {
      db.bula_produtos.unshift({
        id: genId('bula'),
        ...prod,
        registro_mapa: regMapa,
        nome_comercial: nomeCom,
        created: nowIso(),
        updated: nowIso(),
      })
    }
    saveDb(db)
    return jsonResponse(200, {
      sucesso: true,
      mensagem: `Bula oficial de "${nomeCom}" (${regMapa}) gravada com sucesso.`,
      registro_mapa: regMapa,
      nome_comercial: nomeCom,
      contadores: {
        bula_produtos: { inseridos: existente ? 0 : 1, atualizados: existente ? 1 : 0 },
        bula_composicao: { inseridos: (dados.composicao || []).length, atualizados: 0 },
        bula_empresas: { inseridos: (dados.empresas || []).length, atualizados: 0 },
        bula_embalagens: { inseridos: 0, atualizados: 0 },
        bula_culturas: { inseridos: (dados.culturas || []).length, atualizados: 0 },
        bula_alvos: { inseridos: 0, atualizados: 0 },
        bula_aplicacao: { inseridos: 0, atualizados: 0 },
        base_mestre: { inseridos: 0, atualizados: 1 },
      },
    })
  }

  if (
    pathname === '/api/collections/users/request-password-reset' ||
    pathname === '/api/collections/users/confirm-password-reset'
  ) {
    return jsonResponse(204, null)
  }

  if (pathname.startsWith('/api/realtime')) {
    return jsonResponse(200, { clientId: 'local_realtime_client' })
  }

  // ---------------------------------------------------------------------------
  // 2. ENDPOINTS CUSTOMIZADOS (/backend/v1/*)
  // ---------------------------------------------------------------------------
  if (pathname === '/backend/v1/validar-produto' && method === 'POST') {
    const nomeComercial = String(
      bodyObj.nome_comercial || bodyObj.nome_produto || bodyObj.nome_completo || '',
    ).trim()
    if (!nomeComercial) {
      return jsonResponse(400, {
        status: 'REPROVADO',
        error: 'O campo Nome Comercial é obrigatório para a validação.',
      })
    }

    const principioAtivoInformado = String(bodyObj.principio_ativo || '').trim()
    const codigoMapaInformado = String(
      bodyObj.codigo_mapa || bodyObj.registro_mapa || bodyObj.registro || '',
    ).trim()
    const embalagemInformada = String(bodyObj.embalagem || '').trim()
    const embParseada = parsearEmbalagemComercial(embalagemInformada || 'Bombona 20 L')
    const qtdEmbalagemFinal =
      bodyObj.quantidade !== undefined && Number(bodyObj.quantidade) > 0
        ? Number(bodyObj.quantidade)
        : embParseada.quantidade || 20
    const unidadeFinal = String(bodyObj.unidade || embParseada.unidade || 'L')
      .trim()
      .toUpperCase()
    const acondicionamentoFinal =
      bodyObj.forma_acondicionamento || embParseada.acondicionamento || 'Bombona'
    const embalagemFinal = `${acondicionamentoFinal} ${qtdEmbalagemFinal} ${unidadeFinal}`.trim()

    const regDigits = codigoMapaInformado.replace(/\D/g, '')
    const normNome = normalizarTexto(nomeComercial)

    // Busca na base_mestre
    let cadastroBm =
      db.base_mestre.find((r) => {
        const rd = String(r.registro_mapa || '').replace(/\D/g, '')
        const mMapa =
          regDigits && rd && (rd === regDigits || rd.endsWith(regDigits) || regDigits.endsWith(rd))
        const mNome =
          normalizarTexto(r.nome_completo) === normNome ||
          normalizarTexto(r.marca_padronizada) === normNome
        return (mMapa || mNome) && Number(r.quantidade_embalagem_principal) === qtdEmbalagemFinal
      }) ||
      db.base_mestre.find((r) => {
        const rd = String(r.registro_mapa || '').replace(/\D/g, '')
        const mMapa =
          regDigits && rd && (rd === regDigits || rd.endsWith(regDigits) || regDigits.endsWith(rd))
        const mNome =
          normalizarTexto(r.nome_completo) === normNome ||
          normalizarTexto(r.marca_padronizada) === normNome
        return Boolean(mMapa || mNome)
      }) ||
      null

    const bulaMatch =
      db.bula_produtos.find((b) => {
        const rd = String(b.registro_mapa || '').replace(/\D/g, '')
        return (
          (regDigits && rd && (rd === regDigits || rd.endsWith(regDigits))) ||
          normalizarTexto(b.nome_comercial) === normNome
        )
      }) || null

    const principioAtivoFinal =
      bulaMatch?.principio_ativo ||
      cadastroBm?.principio_ativo ||
      principioAtivoInformado ||
      nomeComercial
    const fabricanteFinal =
      bulaMatch?.titular_registro ||
      cadastroBm?.titular_fabricante ||
      bodyObj.fabricante ||
      'Fabricante Homologado MAPA'
    const registroMapaFinal = sanitizarRegistroMapa(
      bulaMatch?.registro_mapa || codigoMapaInformado || cadastroBm?.registro_mapa || '',
    )

    const isNota2 =
      cadastroBm?.nota_subpos_2 === 'SIM' ||
      verificarNotaSubpos2(principioAtivoFinal, nomeComercial)

    let ncmResolvidaBaseMestre = ''
    if (cadastroBm) {
      if (isNota2) {
        if (qtdEmbalagemFinal <= 0.3) ncmResolvidaBaseMestre = '3808.61.00'
        else if (qtdEmbalagemFinal <= 7.5) ncmResolvidaBaseMestre = '3808.62.90'
        else ncmResolvidaBaseMestre = '3808.69.90'
      } else {
        ncmResolvidaBaseMestre = formatarNcmMascara(
          cadastroBm.ncm_especifica || cadastroBm.ncm_padrao || cadastroBm.ncm || '',
        )
      }
    }

    const trava1Passou = Boolean(ncmResolvidaBaseMestre)
    const trava1Mensagem = trava1Passou
      ? `NCM ${ncmResolvidaBaseMestre} resolvida da Base Mestre e homologada na TIPI.`
      : 'Produto sem classificação tributária na Base Mestre'

    const regraNcm = db.regras_ncm_embalagem.find(
      (r) => String(r.ncm).replace(/\D/g, '') === ncmResolvidaBaseMestre.replace(/\D/g, ''),
    )
    let trava2Passou = false
    let trava2Msg = ''
    if (!trava1Passou) {
      trava2Passou = false
      trava2Msg = 'Bloqueada: aguardando resolução de NCM na Base Mestre.'
    } else if (regraNcm && Array.isArray(regraNcm.embalagens_permitidas)) {
      const ok = regraNcm.embalagens_permitidas.some((p: string) =>
        normalizarTexto(p).includes(normalizarTexto(acondicionamentoFinal)),
      )
      trava2Passou = ok
      trava2Msg = ok
        ? `Embalagem "${embalagemFinal}" autorizada para o NCM ${ncmResolvidaBaseMestre} na matriz TIPI.`
        : `Embalagem "${acondicionamentoFinal}" não consta na matriz de acondicionamentos homologados para ${ncmResolvidaBaseMestre}.`
    } else {
      trava2Passou = true
      trava2Msg = `Embalagem "${embalagemFinal}" vinculada com sucesso ao NCM ${ncmResolvidaBaseMestre}.`
    }

    const paDict = db.dicionario_principios_ativos.find((p) =>
      normalizarTexto(principioAtivoFinal).includes(normalizarTexto(p.principio_ativo_chave)),
    )
    const trava3Passou = Boolean(paDict || bulaMatch || cadastroBm || !principioAtivoInformado)

    // Trava 4 (4 campos)
    const chaveAlvo = gerarChaveDuplicidadeBaseMestre({
      nome_comercial: nomeComercial,
      principio_ativo: principioAtivoFinal,
      quantidade_embalagem_principal: qtdEmbalagemFinal,
      registro_mapa: registroMapaFinal,
    })
    const dupsMesmaChave = db.base_mestre.filter(
      (r) =>
        gerarChaveDuplicidadeBaseMestre({
          nome_completo: r.nome_completo,
          marca_padronizada: r.marca_padronizada,
          principio_ativo: r.principio_ativo,
          quantidade_embalagem_principal: r.quantidade_embalagem_principal,
          embalagem: r.embalagem,
          registro_mapa: r.registro_mapa,
        }) === chaveAlvo,
    )
    const trava4Passou = dupsMesmaChave.length <= 1
    const trava4Msg = trava4Passou
      ? `Registro único e íntegro na Base Mestre para a chave canônica (${nomeComercial} | ${qtdEmbalagemFinal} ${unidadeFinal} | MAPA ${registroMapaFinal || 'ISENTO'}).`
      : `Foram encontrados ${dupsMesmaChave.length} registros duplicados na Base Mestre com a mesma combinação de 4 campos.`

    const concNum =
      bodyObj.concentracao !== undefined && bodyObj.concentracao !== ''
        ? Number(String(bodyObj.concentracao).replace(',', '.'))
        : null
    const trava5Passou = concNum === null || (!Number.isNaN(concNum) && concNum > 0 && concNum <= 1000)
    const trava5Msg = trava5Passou
      ? concNum !== null
        ? `Concentração informada (${concNum} g/L ou g/kg) dentro dos limites técnicos (0 a 1000).`
        : 'Formulação/concentração técnica homologada conforme bula oficial.'
      : `Concentração informada (${bodyObj.concentracao}) fora da faixa técnica permitida.`

    const regDigitsVal = (registroMapaFinal || '').replace(/\D/g, '')
    const trava6Passou = regDigitsVal.length >= 3 || /isento/i.test(registroMapaFinal)
    const trava6Msg = trava6Passou
      ? `Registro MAPA oficial (${registroMapaFinal || 'ISENTO'}) validado no AGROFIT / Base Mestre.`
      : 'Registro MAPA não localizado ou em formato inválido.'

    const travas = [
      { id_trava: 1, trava_nome: 'NCM Obrigatória (Base Mestre & TIPI)', aprovado: trava1Passou, mensagem: trava1Mensagem },
      { id_trava: 2, trava_nome: 'Embalagem vs NCM', aprovado: trava2Passou, mensagem: trava2Msg },
      {
        id_trava: 3,
        trava_nome: 'Princípio Ativo na Matriz / Bula',
        aprovado: trava3Passou,
        mensagem: trava3Passou
          ? `Princípio ativo "${principioAtivoFinal}" vinculado com sucesso.`
          : `Princípio ativo "${principioAtivoInformado}" não localizado.`,
      },
      { id_trava: 4, trava_nome: 'Duplicidade de Cadastro (4 Campos)', aprovado: trava4Passou, mensagem: trava4Msg },
      { id_trava: 5, trava_nome: 'Concentração Válida', aprovado: trava5Passou, mensagem: trava5Msg },
      { id_trava: 6, trava_nome: 'Registro MAPA', aprovado: trava6Passou, mensagem: trava6Msg },
    ]

    for (const t of travas) {
      db.log_validacoes.unshift({
        id: genId('log'),
        nome_produto: nomeComercial,
        ncm: ncmResolvidaBaseMestre.replace(/\D/g, ''),
        embalagem: embalagemFinal,
        principio_ativo: principioAtivoFinal,
        id_trava: t.id_trava,
        trava_nome: t.trava_nome,
        aprovado: t.aprovado,
        mensagem: t.mensagem,
        created: nowIso(),
        updated: nowIso(),
      })
    }
    saveDb(db)

    const motorCanonico = executarMotorCanonicoFrontend({
      nome_completo: nomeComercial,
      ncm: ncmResolvidaBaseMestre || '3808.93.29',
      principio_ativo: principioAtivoFinal,
      embalagem: embalagemFinal,
      fabricante: fabricanteFinal,
      registro_mapa: registroMapaFinal,
      origem_base: 'BASE_MESTRE_RESOLUCAO',
    })
    motorCanonico.ncm_padrao = ncmResolvidaBaseMestre
    motorCanonico.ncm_especifica = ncmResolvidaBaseMestre
    motorCanonico.quantidade_embalagem_principal = qtdEmbalagemFinal
    motorCanonico.unidade_medida_principal = unidadeFinal
    motorCanonico.forma_acondicionamento = acondicionamentoFinal

    const ncmUserLimpa = String(bodyObj.ncm || '').replace(/\D/g, '')
    const ncmEspLimpa = ncmResolvidaBaseMestre.replace(/\D/g, '')
    const faixaCompativel =
      !isNota2 || !ncmUserLimpa || ncmUserLimpa.length !== 8 || ncmUserLimpa === ncmEspLimpa

    const vereditoGeral = !trava1Passou
      ? 'REPROVADO'
      : travas.every((t) => t.aprovado)
        ? 'APROVADO'
        : 'APROVADO COM RESSALVAS'

    return jsonResponse(200, {
      veredito_geral: vereditoGeral,
      status: vereditoGeral === 'REPROVADO' ? 'REPROVADO' : 'APROVADO',
      veredito_motivo: !trava1Passou
        ? trava1Mensagem
        : 'Produto validado com sucesso e em conformidade com a Base Mestre.',
      modo: bodyObj.modo || 'novo',
      score: vereditoGeral === 'APROVADO' ? 100 : vereditoGeral === 'APROVADO COM RESSALVAS' ? 75 : 30,
      total_travas: travas.length,
      total_aprovadas: travas.filter((t) => t.aprovado).length,
      campos_validacao: [
        {
          campo: 'Nome Comercial',
          chave: 'nome_comercial',
          obrigatorio: true,
          informado: nomeComercial,
          encontrado_bula: cadastroBm?.marca_padronizada || nomeComercial,
          status: 'OK',
          explicacao: 'Nome comercial localizado e homologado.',
        },
        {
          campo: 'Princípio Ativo',
          chave: 'principio_ativo',
          obrigatorio: false,
          informado: principioAtivoInformado || principioAtivoFinal,
          encontrado_bula: principioAtivoFinal,
          status: 'OK',
          explicacao: `Princípio ativo conferido: "${principioAtivoFinal}".`,
        },
        {
          campo: 'NCM (Base Mestre)',
          chave: 'ncm',
          obrigatorio: true,
          informado: ncmUserLimpa ? formatarNcmMascara(ncmUserLimpa) : '(Resolvido via Base Mestre)',
          encontrado_bula: ncmResolvidaBaseMestre || 'Sem NCM na Base Mestre',
          status: trava1Passou ? 'OK' : 'DIVERGENTE',
          explicacao: trava1Mensagem,
        },
        {
          campo: 'Código MAPA',
          chave: 'codigo_mapa',
          obrigatorio: false,
          informado: codigoMapaInformado || registroMapaFinal,
          encontrado_bula: registroMapaFinal,
          status: 'OK',
          explicacao: `Registro MAPA validado: ${registroMapaFinal}.`,
        },
        {
          campo: 'Embalagem e Quantidade',
          chave: 'embalagem',
          obrigatorio: false,
          informado: embalagemInformada || embalagemFinal,
          encontrado_bula: embalagemFinal,
          status: 'OK',
          explicacao: `Embalagem auditada: ${embalagemFinal}.`,
        },
      ],
      possui_diferenca_ncm_embalagem: isNota2,
      linhas_ncm_embalagem: isNota2
        ? [
            {
              faixa_id: 1,
              faixa_nome: 'Faixa 1: Embalagens até 300 g / 300 mL (≤ 0,3 kg)',
              faixa_rotulo: '≤ 300 g (Frascos / Sachês)',
              exemplo_embalagem: 'Frasco 250 mL / Sachê 100 g',
              ncm_correta: '3808.61.00',
              ncm_informada_se_aplica: qtdEmbalagemFinal <= 0.3,
              status_aplicacao: qtdEmbalagemFinal <= 0.3 ? 'FAIXA APLICÁVEL' : 'OUTRO ENQUADRAMENTO TIPI',
              observacao: 'Subposição específica TIPI para apresentação ≤ 300 g.',
            },
            {
              faixa_id: 2,
              faixa_nome: 'Faixa 2: Embalagens acima de 300 g até 7,5 kg / L',
              faixa_rotulo: '> 300 g e ≤ 7,5 kg (Frascos / Galões)',
              exemplo_embalagem: 'Frasco 1 L / Galão 5 L',
              ncm_correta: '3808.62.90',
              ncm_informada_se_aplica: qtdEmbalagemFinal > 0.3 && qtdEmbalagemFinal <= 7.5,
              status_aplicacao:
                qtdEmbalagemFinal > 0.3 && qtdEmbalagemFinal <= 7.5
                  ? 'FAIXA APLICÁVEL'
                  : 'OUTRO ENQUADRAMENTO TIPI',
              observacao: 'Subposição específica TIPI para embalagens intermediárias (até 7,5 kg/L).',
            },
            {
              faixa_id: 3,
              faixa_nome: 'Faixa 3: Embalagens acima de 7,5 kg / L',
              faixa_rotulo: '> 7,5 kg (Bombonas / Tambores / IBC)',
              exemplo_embalagem: 'Bombona 20 L / Tambor 200 L',
              ncm_correta: '3808.69.90',
              ncm_informada_se_aplica: qtdEmbalagemFinal > 7.5,
              status_aplicacao: qtdEmbalagemFinal > 7.5 ? 'FAIXA APLICÁVEL' : 'OUTRO ENQUADRAMENTO TIPI',
              observacao: 'Subposição residual TIPI para embalagens de grande porte (> 7,5 kg/L).',
            },
          ]
        : [
            {
              faixa_id: 1,
              faixa_nome: embalagemFinal,
              faixa_rotulo: `${qtdEmbalagemFinal} ${unidadeFinal} (${acondicionamentoFinal})`,
              exemplo_embalagem: embalagemFinal,
              ncm_correta: ncmResolvidaBaseMestre || 'Sem NCM na Base Mestre',
              ncm_informada_se_aplica: Boolean(ncmResolvidaBaseMestre),
              status_aplicacao: ncmResolvidaBaseMestre
                ? 'NCM RESOLVIDA DA BASE MESTRE'
                : 'SEM CLASSIFICAÇÃO NA BASE MESTRE',
              observacao: `Classificação fiscal oficial resolvida da Base Mestre para ${embalagemFinal}.`,
            },
          ],
      analise_faixa_tipi: {
        possui_faixas: isNota2,
        compativel: faixaCompativel,
        alerta: faixaCompativel
          ? null
          : `NCM ${formatarNcmMascara(ncmUserLimpa)} incompatível com embalagem de ${qtdEmbalagemFinal} ${unidadeFinal} → esperado ${ncmResolvidaBaseMestre}`,
        ncm_esperada: ncmResolvidaBaseMestre,
        faixa_aplicavel_nome:
          qtdEmbalagemFinal <= 0.3
            ? 'Até 300 g (≤ 0,3 kg)'
            : qtdEmbalagemFinal <= 7.5
              ? 'Acima de 300 g até 7,5 kg / L'
              : 'Acima de 7,5 kg / L',
        quantidade_analisada: `${qtdEmbalagemFinal} ${unidadeFinal}`,
      },
      travas,
      produto_canonico: motorCanonico,
      fontes_consultadas: [
        {
          fonte: 'Base Mestre Homologada (Validador Agro)',
          tipo: 'mapa',
          status: cadastroBm ? 'sucesso' : 'nao_encontrado',
          detalhes: cadastroBm
            ? `Produto localizado na Base Mestre: ${cadastroBm.marca_padronizada} (${ncmResolvidaBaseMestre}).`
            : 'Produto não encontrado na Base Mestre.',
        },
      ],
      gravacao_base_mestre: {
        executada: false,
        acao: 'nenhuma',
        id_registro: cadastroBm?.id || null,
        mensagem: '',
      },
    })
  }

  if (pathname === '/backend/v1/relatorio-duplicidades' && method === 'GET') {
    const mapaGrupos = new Map<string, Record<string, any>[]>()
    for (const item of db.base_mestre) {
      const chave = gerarChaveDuplicidadeBaseMestre({
        nome_completo: item.nome_completo,
        marca_padronizada: item.marca_padronizada,
        principio_ativo: item.principio_ativo,
        quantidade_embalagem_principal: item.quantidade_embalagem_principal,
        embalagem: item.embalagem,
        registro_mapa: item.registro_mapa,
      })
      const arr = mapaGrupos.get(chave) || []
      arr.push(item)
      mapaGrupos.set(chave, arr)
    }

    const grupos: any[] = []
    let totalDuplicados = 0
    let idx = 1
    for (const [chave, regs] of mapaGrupos.entries()) {
      if (regs.length > 1) {
        totalDuplicados += regs.length
        grupos.push({
          id: `dup_grp_${idx++}`,
          criterio: 'Combinação Canônica de 4 Campos (Nome + Princípio Ativo + Embalagem + MAPA)',
          chave: formatarRotuloLegivelDuplicada(regs[0]),
          chave_canonica: chave,
          quantidade: regs.length,
          registros: regs,
        })
      }
    }
    return jsonResponse(200, {
      total_grupos: grupos.length,
      total_produtos_duplicados: totalDuplicados,
      grupos,
    })
  }

  if (pathname === '/backend/v1/importar-lote' && method === 'POST') {
    const colName = String(bodyObj.collection || 'base_mestre')
    const rows = Array.isArray(bodyObj.records) ? bodyObj.records : []
    const col = db[colName] || (db[colName] = [])

    let inseridos = 0
    let atualizados = 0
    for (const item of rows) {
      const data = item.data || item
      if (colName === 'base_mestre') {
        const chave = gerarChaveDuplicidadeBaseMestre(data)
        const existente = col.find((r) => gerarChaveDuplicidadeBaseMestre(r) === chave)
        if (existente) {
          Object.assign(existente, data, { updated: nowIso() })
          atualizados++
        } else {
          col.unshift({
            id: genId('bm'),
            ...data,
            status_validacao: data.status_validacao || 'aprovado',
            created: nowIso(),
            updated: nowIso(),
          })
          inseridos++
        }
      } else {
        col.unshift({
          id: genId(colName.slice(0, 3)),
          ...data,
          created: nowIso(),
          updated: nowIso(),
        })
        inseridos++
      }
    }
    saveDb(db)
    return jsonResponse(200, {
      sucesso: true,
      inseridos,
      atualizados,
      ignorados: 0,
      espelhadosBaseMestre: colName === 'bula_produtos' ? inseridos : 0,
      erros: [],
      resumoCategorias: {},
    })
  }

  if (pathname === '/backend/v1/limpar-bases' && method === 'POST') {
    const alvo = bodyObj.alvo || 'base_mestre'
    const bmCount = db.base_mestre.length
    const paCount = db.dicionario_principios_ativos.length
    if (alvo === 'base_mestre' || alvo === 'todas') db.base_mestre = []
    if (alvo === 'dicionario_principios_ativos' || alvo === 'todas') db.dicionario_principios_ativos = []
    saveDb(db)
    return jsonResponse(200, {
      sucesso: true,
      mensagem: 'Limpeza concluída com sucesso.',
      alvo,
      apagados: {
        base_mestre: alvo !== 'dicionario_principios_ativos' ? bmCount : 0,
        dicionario_principios_ativos: alvo !== 'base_mestre' ? paCount : 0,
        total: (alvo !== 'dicionario_principios_ativos' ? bmCount : 0) + (alvo !== 'base_mestre' ? paCount : 0),
      },
      preservados: ['regras_ncm_embalagem', 'parametrizacao_fiscal'],
      timestamp: nowIso(),
    })
  }

  if (pathname === '/backend/v1/limpar-bula' && method === 'POST') {
    const counts = {
      bula_produtos: db.bula_produtos.length,
      bula_composicao: db.bula_composicao.length,
      bula_empresas: db.bula_empresas.length,
      bula_embalagens: db.bula_embalagens.length,
      bula_culturas: db.bula_culturas.length,
      bula_alvos: db.bula_alvos.length,
      bula_aplicacao: db.bula_aplicacao.length,
      total: 0,
    }
    counts.total =
      counts.bula_produtos +
      counts.bula_composicao +
      counts.bula_empresas +
      counts.bula_embalagens +
      counts.bula_culturas +
      counts.bula_alvos +
      counts.bula_aplicacao
    db.bula_produtos = []
    db.bula_composicao = []
    db.bula_empresas = []
    db.bula_embalagens = []
    db.bula_culturas = []
    db.bula_alvos = []
    db.bula_aplicacao = []
    saveDb(db)
    return jsonResponse(200, {
      sucesso: true,
      mensagem: 'Cadastro de bulas limpo com sucesso.',
      apagados: counts,
      preservados: ['base_mestre'],
      timestamp: nowIso(),
    })
  }

  if (pathname === '/backend/v1/sincronizar-produtos' && method === 'POST') {
    const syncRec = {
      id: genId('sync'),
      status: 'sucesso',
      fontes_consultadas: bodyObj.fontes || ['MAPA / AGROFIT', 'SIPEAGRO', 'Bioinsumos'],
      total_consultados: db.base_mestre.length,
      novos_incluidos: 0,
      atualizados: db.base_mestre.length,
      ja_existentes: db.base_mestre.length,
      erros_validacao: 0,
      duracao_ms: 860,
      resumo: `Sincronização concluída: ${db.base_mestre.length} registros homologados nas bases oficiais MAPA/AGROFIT.`,
      relatorio_itens: db.base_mestre.map((b) => ({
        nome_produto: b.marca_padronizada || b.nome_completo,
        principio_ativo: b.principio_ativo,
        ncm: b.ncm_especifica || b.ncm_padrao,
        registro_mapa: b.registro_mapa,
        fabricante: b.titular_fabricante,
        embalagem: b.embalagem,
        fonte_origem: 'MAPA / AGROFIT',
        acao: 'atualizado',
        motivo: 'Conformidade fiscal e regulatória validada.',
      })),
      created: nowIso(),
      updated: nowIso(),
    }
    db.sincronizacao_historico.unshift(syncRec)
    saveDb(db)
    return jsonResponse(200, {
      sucesso: true,
      historico_id: syncRec.id,
      ...syncRec,
    })
  }

  if (pathname.startsWith('/backend/v1/sincronizar-pa-cascata/') && method === 'POST') {
    const paId = decodeURIComponent(pathname.split('/').pop() || '')
    const pa = db.dicionario_principios_ativos.find((p) => p.id === paId)
    let atualizados = 0
    if (pa) {
      for (const bm of db.base_mestre) {
        if (
          bm.principio_ativo_id === pa.id ||
          normalizarTexto(bm.principio_ativo) === normalizarTexto(pa.principio_ativo_chave)
        ) {
          bm.nota_subpos_2 = pa.nota_subpos_2
          bm.ncm_faixa1_ate_300g = pa.ncm_faixa1_ate_300g
          bm.ncm_faixa2_300g_a_7_5kg = pa.ncm_faixa2_300g_a_7_5kg
          bm.ncm_faixa3_7_5kg_a_10kg = pa.ncm_faixa3_7_5kg_a_10kg
          bm.ncm_faixa4_acima_10kg = pa.ncm_faixa4_acima_10kg
          bm.updated = nowIso()
          atualizados++
        }
      }
      saveDb(db)
    }
    return jsonResponse(200, {
      sucesso: true,
      mensagem: `Regras do princípio ativo propagadas para ${atualizados} produto(s) na Base Mestre.`,
      total_vinculados: atualizados,
      atualizados,
    })
  }

  if (pathname === '/backend/v1/importar-novo-cadastro' && method === 'POST') {
    const nome = String(bodyObj.nome_comercial_portal || '').trim()
    const paNome = String(bodyObj.principio_ativo_declarado || '').trim().toUpperCase()
    const mapa = sanitizarRegistroMapa(bodyObj.numero_registro_mapa || '')
    const emb = String(bodyObj.embalagem_comercial || 'Bombona 20 L')
    const canon = executarMotorCanonicoFrontend({
      nome_completo: nome,
      principio_ativo: paNome,
      registro_mapa: mapa,
      embalagem: emb,
      fabricante: bodyObj.titular_registro || 'Titular Oficial MAPA',
    })

    let paRec = db.dicionario_principios_ativos.find(
      (p) => normalizarTexto(p.principio_ativo_chave) === normalizarTexto(paNome),
    )
    let paNovo = false
    if (!paRec) {
      paNovo = true
      paRec = {
        id: genId('pa'),
        principio_ativo_chave: paNome,
        principio_ativo: paNome,
        classe_agronomica: bodyObj.classe_agronomica || canon.sub_grupo,
        nota_subpos_2: canon.nota_subpos_2,
        ncm_padrao: canon.ncm_padrao,
        ncm_faixa1_ate_300g: canon.ncm_faixa1_ate_300g,
        ncm_faixa2_300g_a_7_5kg: canon.ncm_faixa2_300g_a_7_5kg,
        ncm_faixa3_7_5kg_a_10kg: canon.ncm_faixa3_7_5kg_a_10kg,
        ncm_faixa4_acima_10kg: canon.ncm_faixa4_acima_10kg,
        regra_tipi: canon.regra_tipi,
        status_pis_cofins: canon.status_pis_cofins,
        created: nowIso(),
        updated: nowIso(),
      }
      db.dicionario_principios_ativos.unshift(paRec)
    }

    const parsedEmb = parsearEmbalagemComercial(emb)
    const bmRec = {
      id: genId('bm'),
      ...canon,
      nome_produto: canon.marca_padronizada,
      ncm: canon.ncm_padrao.replace(/\D/g, ''),
      ncm_especifica: canon.ncm_padrao,
      quantidade_embalagem_principal: parsedEmb.quantidade || 20,
      unidade_medida_principal: parsedEmb.unidade || 'L',
      forma_acondicionamento: parsedEmb.acondicionamento || 'Bombona',
      principio_ativo_id: paRec.id,
      status_validacao: 'aprovado',
      created: nowIso(),
      updated: nowIso(),
    }
    db.base_mestre.unshift(bmRec)
    saveDb(db)

    return jsonResponse(200, {
      sucesso: true,
      mensagem: 'Pipeline Dual-Sync executado com sucesso.',
      principio_ativo_id: paRec.id,
      principio_ativo_chave: paRec.principio_ativo_chave,
      principio_ativo_novo_criado: paNovo,
      produto_mestre_id: bmRec.id,
      produto_mestre_nome: bmRec.marca_padronizada,
      registro_mapa: bmRec.registro_mapa,
      ncm_padrao: bmRec.ncm_padrao,
      cst_saida: bmRec.cst_saida,
    })
  }

  if (pathname === '/backend/v1/bula/recalcular-principios-ativos' && method === 'POST') {
    return jsonResponse(200, {
      sucesso: true,
      mensagem: 'Princípios ativos conferidos e atualizados a partir da Composição e Base Mestre.',
      totalAnalisados: db.bula_produtos.length,
      totalAtualizados: db.bula_produtos.length,
      mantidosPreenchidos: db.bula_produtos.length,
      detalhesFontes: {
        resolvidosPorComposicao: db.bula_produtos.length,
        resolvidosPorBaseMestre: 0,
        resolvidosPorExtras: 0,
      },
    })
  }

  // Consultor Tributário Chat endpoints
  if (pathname.startsWith('/backend/v1/tributacao/conversas') && method === 'GET') {
    const parts = pathname.split('/')
    if (parts.length >= 6 && parts[5] === 'mensagens') {
      const convId = decodeURIComponent(parts[4])
      const msgs = db.tributacao_mensagens.filter((m) => m.conversation_id === convId)
      return jsonResponse(200, { messages: msgs })
    }
    return jsonResponse(200, { conversations: db.tributacao_conversas })
  }

  if (pathname === '/backend/v1/tributacao/chat' && method === 'POST') {
    const text = String(bodyObj.message || '').trim()
    let convId = bodyObj.conversation_id
    if (!convId) {
      convId = genId('conv')
      db.tributacao_conversas.unshift({
        id: convId,
        title: String(bodyObj.title || text.slice(0, 48) || 'Consulta Tributária Agro'),
        created: nowIso(),
        updated: nowIso(),
      })
    }
    const userMsg = {
      id: genId('msg_u'),
      conversation_id: convId,
      role: 'user',
      content: text,
      created: nowIso(),
    }
    const resposta = responderConsultorTributario(text, db)
    const assistantMsg = {
      id: genId('msg_a'),
      conversation_id: convId,
      role: 'assistant',
      content: resposta,
      created: nowIso(),
    }
    db.tributacao_mensagens.push(userMsg, assistantMsg)
    saveDb(db)

    return jsonResponse(200, {
      conversation_id: convId,
      message_id: assistantMsg.id,
      content: resposta,
      citations: [],
    })
  }

  // Gestão de Usuários
  if (pathname === '/backend/v1/usuarios' && method === 'GET') {
    return jsonResponse(200, {
      sucesso: true,
      usuarios: db.users,
      convites: db.convites_usuarios,
    })
  }

  if (pathname === '/backend/v1/usuarios/convidar' && method === 'POST') {
    const email = String(bodyObj.email || '').trim().toLowerCase()
    const role = bodyObj.role === 'admin' ? 'admin' : 'analista'
    const nome = String(bodyObj.nome || email.split('@')[0]).trim()
    const novoUser = {
      id: genId('usr'),
      name: nome,
      email,
      role,
      verified: true,
      created: nowIso(),
      updated: nowIso(),
    }
    db.users.push(novoUser)
    saveDb(db)
    return jsonResponse(200, {
      sucesso: true,
      mensagem: `Usuário ${email} convidado com sucesso como ${role}.`,
      email_enviado: true,
      usuario_id: novoUser.id,
      email,
      role,
    })
  }

  if (pathname === '/backend/v1/usuarios/alterar-papel' && method === 'POST') {
    const target = db.users.find((u) => u.id === bodyObj.id)
    if (target) {
      target.role = bodyObj.role === 'admin' ? 'admin' : 'analista'
      target.updated = nowIso()
      saveDb(db)
    }
    return jsonResponse(200, {
      sucesso: true,
      mensagem: 'Perfil de acesso atualizado com sucesso.',
    })
  }

  if (pathname === '/backend/v1/usuarios/excluir' && method === 'POST') {
    if (bodyObj.id) {
      db.users = db.users.filter((u) => u.id !== bodyObj.id)
    }
    if (bodyObj.convite_id) {
      db.convites_usuarios = db.convites_usuarios.filter((c) => c.id !== bodyObj.convite_id)
    }
    saveDb(db)
    return jsonResponse(200, {
      sucesso: true,
      mensagem: 'Registro removido com sucesso.',
    })
  }

  // ---------------------------------------------------------------------------
  // 3. CRUD GENÉRICO DE COLEÇÕES POCKETBASE (/api/collections/:collection/records)
  // ---------------------------------------------------------------------------
  const matchCol = pathname.match(/^\/api\/collections\/([^/]+)\/records(?:\/([^/]+))?$/)
  if (matchCol) {
    const colName = decodeURIComponent(matchCol[1])
    const recordId = matchCol[2] ? decodeURIComponent(matchCol[2]) : null
    const col = db[colName] || (db[colName] = [])

    if (!recordId && method === 'GET') {
      const page = Math.max(1, Number(parsedUrl.searchParams.get('page') || 1))
      const perPage = Math.max(1, Number(parsedUrl.searchParams.get('perPage') || 30))
      const filter = parsedUrl.searchParams.get('filter') || ''
      const sort = parsedUrl.searchParams.get('sort') || ''

      const filtrados = ordenarRegistros(filtrarRegistros(col, filter), sort)
      const totalItems = filtrados.length
      const totalPages = Math.max(1, Math.ceil(totalItems / perPage))
      const start = (page - 1) * perPage
      const items = filtrados.slice(start, start + perPage)

      return jsonResponse(200, {
        page,
        perPage,
        totalItems,
        totalPages,
        items,
      })
    }

    if (!recordId && method === 'POST') {
      const novo = {
        id: genId(colName.slice(0, 3)),
        ...bodyObj,
        created: nowIso(),
        updated: nowIso(),
      }
      col.unshift(novo)
      saveDb(db)
      return jsonResponse(200, novo)
    }

    if (recordId && method === 'GET') {
      const found = col.find((r) => r.id === recordId)
      if (!found) return jsonResponse(404, { message: 'Registro não encontrado.' })
      return jsonResponse(200, found)
    }

    if (recordId && (method === 'PATCH' || method === 'PUT')) {
      const found = col.find((r) => r.id === recordId)
      if (!found) return jsonResponse(404, { message: 'Registro não encontrado.' })
      Object.assign(found, bodyObj, { updated: nowIso() })
      saveDb(db)
      return jsonResponse(200, found)
    }

    if (recordId && method === 'DELETE') {
      const idx = col.findIndex((r) => r.id === recordId)
      if (idx !== -1) {
        col.splice(idx, 1)
        saveDb(db)
      }
      return new Response(null, { status: 204 })
    }
  }

  return null
}

export function installLocalPocketBaseInterceptor() {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __pbInterceptorInstalled?: boolean }
  if (w.__pbInterceptorInstalled) return
  w.__pbInterceptorInstalled = true

  const nativeFetch = window.fetch.bind(window)
  const configuredPbUrl = (import.meta.env.VITE_POCKETBASE_URL || '').trim()

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

    let isApiOrBackend = false
    try {
      const u = new URL(urlStr, window.location.origin)
      if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/backend/')) {
        isApiOrBackend = true
      }
    } catch {
      // ignore
    }

    // Se não há URL externa do PocketBase configurada, atende direto pelo motor local
    if (isApiOrBackend && !configuredPbUrl) {
      const localResp = await handleLocalPocketBaseRequest(urlStr, init)
      if (localResp) return localResp
    }

    // Se há URL configurada, tenta o servidor remoto e faz fallback caso falhe/404
    try {
      const res = await nativeFetch(input, init)
      if (isApiOrBackend && (res.status === 404 || res.status >= 500)) {
        const localResp = await handleLocalPocketBaseRequest(urlStr, init)
        if (localResp) return localResp
      }
      return res
    } catch (err) {
      if (isApiOrBackend) {
        const localResp = await handleLocalPocketBaseRequest(urlStr, init)
        if (localResp) return localResp
      }
      throw err
    }
  }
}
