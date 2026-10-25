migrate(
  (app) => {
    // Migration 1740000055: Cadastro e parametrização do COFENRIN (MAPA 06922, Bifentrina 400 g/L EC)
    // Regra da bula e Nota de Subposições 2 do Cap. 38 da TIPI (SC COSIT 98.042/2022):
    // - Embalagens com quantidade ATÉ 7,5 kg -> NCM 3808.62.90 (38086290)
    // - Embalagens com quantidade ACIMA de 7,5 kg -> NCM 3808.69.90 (38086990)
    console.log('Iniciando migration 1740000055: Cadastro COFENRIN com dupla NCM por faixa...')

    // 1. Garantir registros na tabela regras_ncm_embalagem para 38086290 e 38086990
    if (app.hasTable('regras_ncm_embalagem')) {
      const colRegras = app.findCollectionByNameOrId('regras_ncm_embalagem')

      // 38086290 (<= 7,5 kg)
      let regra38086290 = null
      try {
        regra38086290 = app.findFirstRecordByFilter('regras_ncm_embalagem', "ncm = '38086290'")
      } catch (_) {}

      if (!regra38086290) {
        regra38086290 = new Record(colRegras)
        regra38086290.set('ncm', '38086290')
      }
      regra38086290.set(
        'descricao',
        'Inseticidas contendo substâncias da Nota de Subposição 2 do Cap. 38 (ex.: Bifentrina) em embalagens de peso líquido > 300 g até 7,5 kg',
      )
      regra38086290.set('categoria', 'Inseticida')
      regra38086290.set(
        'regra_especial',
        'Nota de Subposições 2 do Cap. 38 TIPI: Conteúdo líquido superior a 300 g e não superior a 7,5 kg',
      )
      regra38086290.set(
        'embalagens_permitidas',
        JSON.stringify([
          'Frasco',
          'Galão',
          'Bombona',
          'Balde',
          'Saco',
          'Caixa',
          '1 L',
          '5 L',
          '1X1L',
          '4X5L',
          '500 mL',
          '1 kg',
          '5 kg',
        ]),
      )
      regra38086290.set('faixa_capacidade_min', 0.301)
      regra38086290.set('faixa_capacidade_max', 7.5)
      regra38086290.set('unidade_capacidade', 'KG')
      app.save(regra38086290)

      // 38086990 (> 7,5 kg)
      let regra38086990 = null
      try {
        regra38086990 = app.findFirstRecordByFilter('regras_ncm_embalagem', "ncm = '38086990'")
      } catch (_) {}

      if (!regra38086990) {
        regra38086990 = new Record(colRegras)
        regra38086990.set('ncm', '38086990')
      }
      regra38086990.set(
        'descricao',
        'Outros inseticidas contendo substâncias da Nota de Subposição 2 do Cap. 38 (ex.: Bifentrina) em embalagens de peso líquido superior a 7,5 kg',
      )
      regra38086990.set('categoria', 'Inseticida')
      regra38086990.set(
        'regra_especial',
        'Nota de Subposições 2 do Cap. 38 TIPI: Conteúdo líquido superior a 7,5 kg',
      )
      regra38086990.set(
        'embalagens_permitidas',
        JSON.stringify([
          'Bombona',
          'Tambor',
          'Container / IBC',
          'Big Bag',
          'Saco',
          'Balde',
          '10 L',
          '20 L',
          '200 L',
          '1000 L',
          '1X20L',
          '20 kg',
        ]),
      )
      regra38086990.set('faixa_capacidade_min', 7.501)
      regra38086990.set('faixa_capacidade_max', 99999)
      regra38086990.set('unidade_capacidade', 'KG')
      app.save(regra38086990)
    }

    // 2. Garantir BIFENTRINA no dicionario_principios_ativos
    if (app.hasTable('dicionario_principios_ativos')) {
      const colPa = app.findCollectionByNameOrId('dicionario_principios_ativos')
      let recPa = null
      try {
        recPa = app.findFirstRecordByFilter(
          'dicionario_principios_ativos',
          "principio_ativo_chave = 'BIFENTRINA' || principio_ativo = 'BIFENTRINA'",
        )
      } catch (_) {}

      if (!recPa) {
        recPa = new Record(colPa)
        recPa.set('principio_ativo_chave', 'BIFENTRINA')
      }
      recPa.set('principio_ativo', 'BIFENTRINA')
      recPa.set('classe_agronomica', 'Inseticida')
      recPa.set('tipo_quimico', 'Piretróide')
      recPa.set('nota_subpos_2', 'SIM')
      recPa.set('ncm_padrao', '3808.62.90')
      recPa.set('ncm_faixa1_ate_300g', '3808.61.00')
      recPa.set('ncm_faixa2_300g_a_7_5kg', '3808.62.90')
      recPa.set('ncm_faixa3_7_5kg_a_10kg', '3808.69.90')
      recPa.set('ncm_faixa4_acima_10kg', '3808.69.90')
      recPa.set(
        'regra_tipi',
        'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022): Bifentrina com enquadramento por capacidade de embalagem',
      )
      recPa.set(
        'status_pis_cofins',
        'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
      )
      app.save(recPa)
    }

    // 3. Garantir parametrização fiscal para 3808.62.90 e 3808.69.90
    if (app.hasTable('parametrizacao_fiscal')) {
      const colParam = app.findCollectionByNameOrId('parametrizacao_fiscal')

      const configs = [
        {
          ncm: '38086290',
          descricao:
            'Inseticidas contendo Bifentrina em embalagens > 300 g até 7,5 kg (Subposição 3808.62)',
          pis: '0,00%',
          cofins: '0,00%',
          icms: 'Redução de 60% BC (Convênio 100/97)',
          cst_pis_saida: '06',
          cst_pis_entrada: '73',
          ibs_cbs: 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
        },
        {
          ncm: '38086990',
          descricao:
            'Outros inseticidas contendo Bifentrina em embalagens > 7,5 kg (Subposição 3808.69)',
          pis: '0,00%',
          cofins: '0,00%',
          icms: 'Redução de 60% BC (Convênio 100/97)',
          cst_pis_saida: '06',
          cst_pis_entrada: '73',
          ibs_cbs: 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
        },
      ]

      for (let i = 0; i < configs.length; i++) {
        const item = configs[i]
        let recParam = null
        try {
          recParam = app.findFirstRecordByFilter(
            'parametrizacao_fiscal',
            `ncm = '${item.ncm}' || ncm = '${item.ncm.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}'`,
          )
        } catch (_) {}

        if (!recParam) {
          recParam = new Record(colParam)
          recParam.set('ncm', item.ncm)
        }
        recParam.set('descricao', item.descricao)
        recParam.set('aliquota_pis', item.pis)
        recParam.set('aliquota_cofins', item.cofins)
        recParam.set('regra_icms', item.icms)
        recParam.set('cst_saida', item.cst_pis_saida)
        recParam.set('cst_entrada', item.cst_pis_entrada)
        recParam.set('reforma_tributaria_ibs_cbs', item.ibs_cbs)
        recParam.set(
          'fundamentacao_legal',
          'Lei nº 10.925/2004 c/c LC nº 224/2025 e Convênio ICMS 100/97',
        )
        try {
          app.save(recParam)
        } catch (_) {}
      }
    }

    // 4. Cadastrar / Atualizar os registros do COFENRIN na base_mestre
    if (app.hasTable('base_mestre')) {
      const colBaseMestre = app.findCollectionByNameOrId('base_mestre')

      // Dados da bula anexada:
      // COFENRIN; ORSA
      // Registro MAPA: 06922 (ou Nº 06922)
      // Princípio Ativo: BIFENTRINA 400 g/L (40% m/v)
      // Titular: RAINBOW DEFENSIVOS AGRÍCOLAS LTDA.
      // CNPJ: 10.486.463/0001-69
      // Classe: Inseticida e acaricida de contato e ingestão
      // Formulação: EC - Concentrado Emulsionável
      // Grupo químico: Piretróide
      // Produto IMPORTADO

      // Cadastramos as duas faixas canônicas do produto na base mestre:
      // Faixa A (<= 7,5 kg): Embalagem representativa Frasco / Galão (ex: 5 L ou 1 L) -> NCM 3808.62.90
      // Faixa B (> 7,5 kg): Embalagem representativa Bombona 20 L -> NCM 3808.69.90
      const registrosCofenrin = [
        {
          quantidade: 5,
          unidade: 'L',
          acondicionamento: 'Galão',
          embalagem: 'Galão 5 L',
          embalagem_original: '4X5L (5 L)',
          ncm_especifica: '3808.62.90',
          ncm: '38086290',
          ncm_padrao: '3808.62.90',
        },
        {
          quantidade: 1,
          unidade: 'L',
          acondicionamento: 'Frasco',
          embalagem: 'Frasco 1 L',
          embalagem_original: '12X1L (1 L)',
          ncm_especifica: '3808.62.90',
          ncm: '38086290',
          ncm_padrao: '3808.62.90',
        },
        {
          quantidade: 20,
          unidade: 'L',
          acondicionamento: 'Bombona',
          embalagem: 'Bombona 20 L',
          embalagem_original: '1X20L (20 L)',
          ncm_especifica: '3808.69.90',
          ncm: '38086990',
          ncm_padrao: '3808.69.90',
        },
        {
          quantidade: 200,
          unidade: 'L',
          acondicionamento: 'Tambor',
          embalagem: 'Tambor 200 L',
          embalagem_original: '1X200L (200 L)',
          ncm_especifica: '3808.69.90',
          ncm: '38086990',
          ncm_padrao: '3808.69.90',
        },
      ]

      for (let k = 0; k < registrosCofenrin.length; k++) {
        const item = registrosCofenrin[k]
        let rec = null
        try {
          const filtro = `(registro_mapa ~ '06922' || marca_padronizada = 'COFENRIN' || nome_completo ~ 'COFENRIN') && quantidade_embalagem_principal = ${item.quantidade} && unidade_medida_principal = '${item.unidade}' && forma_acondicionamento = '${item.acondicionamento}'`
          const achados = app.findRecordsByFilter('base_mestre', filtro, '-created', 1, 0)
          if (achados && achados.length > 0) rec = achados[0]
        } catch (_) {}

        if (!rec) {
          rec = new Record(colBaseMestre)
        }

        rec.set('nome_completo', 'COFENRIN')
        rec.set('nome_produto', 'COFENRIN')
        rec.set('marca_padronizada', 'COFENRIN')
        rec.set('registro_mapa', 'Nº 06922')
        rec.set('principio_ativo', 'BIFENTRINA')
        rec.set('titular_fabricante', 'RAINBOW DEFENSIVOS AGRÍCOLAS LTDA.')
        rec.set('fabricante', 'RAINBOW DEFENSIVOS AGRÍCOLAS LTDA.')
        rec.set('tipo_produto', 'Produto Formulado Comercial')
        rec.set('macro_grupo', 'Defensivos')
        rec.set('sub_grupo', 'Inseticida / Acaricida')
        rec.set('quantidade_embalagem_principal', item.quantidade)
        rec.set('unidade_medida_principal', item.unidade)
        rec.set('forma_acondicionamento', item.acondicionamento)
        rec.set('embalagem', item.embalagem)
        rec.set('embalagem_original', item.embalagem_original)
        rec.set('unidade', item.unidade)
        rec.set('ncm_especifica', item.ncm_especifica)
        rec.set('ncm_padrao', item.ncm_padrao)
        rec.set('ncm', item.ncm)
        rec.set('nota_subpos_2', 'SIM')
        rec.set('ncm_faixa1_ate_300g', '3808.61.00')
        rec.set('ncm_faixa2_300g_a_7_5kg', '3808.62.90')
        rec.set('ncm_faixa3_7_5kg_a_10kg', '3808.69.90')
        rec.set('ncm_faixa4_acima_10kg', '3808.69.90')
        rec.set(
          'regra_tipi',
          'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022): Até 7,5 kg -> 3808.62.90; Acima de 7,5 kg -> 3808.69.90',
        )
        rec.set('sistema_norma_mapa', 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)')
        rec.set(
          'status_pis_cofins',
          'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
        )
        rec.set('aliquota_ate_mar2026', '0,00% (Lei nº 10.925/2004)')
        rec.set('aliquota_pos_abr2026_real', '0,925% (LC nº 224/2025)')
        rec.set('aliquota_pos_abr2026_presumido', '0,365% (LC nº 224/2025)')
        rec.set('cst_saida', 'CST 06')
        rec.set('cst_entrada', 'CST 73')
        rec.set('ibs_cbs_2027', 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)')
        rec.set('status_validacao', 'aprovado')
        rec.set('origem_base', 'BULA_OFICIAL_COFENRIN')
        rec.set('url_oficial', 'https://dados.agricultura.gov.br')

        app.save(rec)
        console.log(
          `COFENRIN gravado para embalagem ${item.embalagem} com NCM ${item.ncm_especifica}`,
        )
      }
    }

    console.log('Migration 1740000055 concluída com sucesso.')
  },
  (app) => {
    console.log('Reversão da migration 1740000055 (no-op)')
  },
)
