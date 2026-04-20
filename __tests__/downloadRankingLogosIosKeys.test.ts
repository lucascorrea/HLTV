import fs from 'fs'
import os from 'os'
import path from 'path'
import { findExistingLogoInDirs, loadExistingIosLogoKeys } from '../src/downloadRankingLogos'

test('loadExistingIosLogoKeys lê apenas pastas *.imageset', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hltv-ios-keys-'))
  fs.mkdirSync(path.join(root, 'natusvincere.imageset'))
  fs.mkdirSync(path.join(root, 'skip.txt.imageset')) // ainda é .imageset
  fs.writeFileSync(path.join(root, 'notadir'), '')
  fs.mkdirSync(path.join(root, 'regularfolder'))

  const keys = loadExistingIosLogoKeys(root)
  expect(keys.has('natusvincere')).toBe(true)
  expect(keys.has('skip.txt')).toBe(true)
  expect(keys.size).toBe(2)
})

test('loadExistingIosLogoKeys retorna vazio se pasta não existe', () => {
  const keys = loadExistingIosLogoKeys(path.join(os.tmpdir(), 'missing-' + Date.now()))
  expect(keys.size).toBe(0)
})

test('findExistingLogoInDirs encontra png/jpg nas pastas dadas', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hltv-local-logo-'))
  const a = path.join(root, 'a')
  const b = path.join(root, 'b')
  fs.mkdirSync(a)
  fs.mkdirSync(b)
  fs.writeFileSync(path.join(a, 'teamx.png'), 'x')
  expect(findExistingLogoInDirs('teamx', [b, a])).toBe(path.join(a, 'teamx.png'))
  expect(findExistingLogoInDirs('missing', [a, b])).toBeNull()
})
