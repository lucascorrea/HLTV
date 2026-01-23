import * as cheerio from 'cheerio'
import { randomUUID } from 'crypto'
import axios from 'axios'

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1'

export const fetchPage = async (
  url: string,
  loadPage: (url: string) => Promise<string>
): Promise<cheerio.Root> => {
  try {
    const response = await axios.post(FLARESOLVERR_URL, {
      cmd: 'request.get',
      url: url,
      maxTimeout: 60000
    })

    if (response.data.status !== 'ok') {
      throw new Error(`FlareSolverr erro: ${response.data.message || 'Erro desconhecido'}`)
    }

    const html = response.data.solution.response

    const errorPatterns = [
      'error code:',
      'Sorry, you have been blocked',
      'Checking your browser before accessing',
      'Enable JavaScript and cookies to continue',
      'verify you are human'
    ]
    const foundError = errorPatterns.find(pattern => html.includes(pattern))

    if (foundError) {
      throw new Error(`Acesso negado | www.hltv.org bloqueado pelo Cloudflare`)
    }

    return cheerio.load(html)
  } catch (error) {
    console.error(`Erro ao buscar página ${url}:`, error)
    throw error
  }
};

export const generateRandomSuffix = () => {
  return randomUUID()
}

export const percentageToDecimalOdd = (odd: number): number =>
  parseFloat(((1 / odd) * 100).toFixed(2))

export function getIdAt(index: number, href: string): number | undefined
export function getIdAt(index: number): (href: string) => number | undefined
export function getIdAt(index?: number, href?: string): any {
  switch (arguments.length) {
    case 1:
      return (href: string) => getIdAt(index!, href)
    default:
      return parseNumber(href!.split('/')[index!])
  }
}

export const notNull = <T>(x: T | null): x is T => x !== null

export const parseNumber = (str: string | undefined): number | undefined => {
  if (!str) {
    return undefined
  }

  const num = Number(str)

  return Number.isNaN(num) ? undefined : num
}

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
