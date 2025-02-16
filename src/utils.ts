import * as cheerio from 'cheerio'
import { randomUUID } from 'crypto'
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export const fetchPage = async (
  url: string,
  loadPage: (url: string) => Promise<string>
): Promise<cheerio.Root> => {

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

 // Configurar cabeçalhos para parecer um navegador real
 await page.setUserAgent(
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
);

await page.setExtraHTTPHeaders({
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1'
});

  await page.goto(url, { waitUntil: 'networkidle2' });

  const html = await page.content();
  await browser.close();

  // Carregar o HTML no Cheerio
  const root = cheerio.load(html);
  // const root = cheerio.load(await loadPage(url))

  // const html = root.html()

  const errorPatterns = [
    'error code:',
    'Sorry, you have been blocked',
    'Checking your browser before accessing',
    'Enable JavaScript and cookies to continue'
  ];

  // Encontrar o primeiro erro presente no HTML
  const foundError = errorPatterns.find(pattern => html.includes(pattern));

  if (foundError) {
    // Capturar trecho do HTML em torno do erro encontrado
    const index = html.indexOf(foundError);
    const snippet = html.substring(Math.max(0, index - 100), index + 200); // Ajuste conforme necessário

    throw new Error(
      `Access denied 1 | www.hltv.org used Cloudflare to restrict access.`
    );
  }

  return root
}

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
