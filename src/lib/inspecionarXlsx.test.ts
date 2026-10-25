import { describe, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Inspecionar XLSX anexado', () => {
  it('inspecionar abas e colunas', async () => {
    const filePath = path.resolve('src/assets/simuladordeoperacoesv3completo-34556.xlsx')
    expect(fs.existsSync(filePath)).toBe(true)
  })
})
