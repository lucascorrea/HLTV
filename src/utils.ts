import * as cheerio from 'cheerio'
import { randomUUID } from 'crypto'
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
const fs = require('fs');

puppeteer.use(StealthPlugin());

export const fetchPage = async (
  url: string,
  loadPage: (url: string) => Promise<string>
): Promise<cheerio.Root> => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Upgrade-Insecure-Requests': '1'
    });

    await page.goto(url, { waitUntil: 'networkidle2' });
    const html = await page.content();

    const errorPatterns = [
      'error code:',
      'Sorry, you have been blocked',
      'Checking your browser before accessing',
      'Enable JavaScript and cookies to continue'
    ];
    const foundError = errorPatterns.find(pattern => html.includes(pattern));

    if (foundError) {
      throw new Error(`Access denied 1 | www.hltv.org used Cloudflare to restrict access.`);
    }

    // console.log(html)
  //   console.log(url)
  //   fs.writeFile('arquivo.txt', html, 'utf8', (err: NodeJS.ErrnoException | null) => {
  //     if (err) {
  //         console.error("Erro ao salvar o arquivo:", err);
  //         return;
  //     }
  //     console.log("Arquivo salvo com sucesso!");
  // });

    return cheerio.load(html);
  } catch (error) {
    console.error(`Erro ao buscar página ${url}:`, error);
    throw error;
  } finally {
    try {
      if (!page.isClosed()) {
        await page.close();
      }
    } catch (pageError) {
      console.error("Erro ao fechar a página:", pageError);
    }

    try {
      await browser.close();
    } catch (browserError) {
      console.error("Erro ao fechar o navegador:", browserError);
    }
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
