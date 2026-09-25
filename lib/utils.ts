import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export const usd = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? '—' : `$${Number(n).toFixed(digits)}`)

export const PHASE_NAMES: Record<number, string> = {
  1: 'ICP Refinement',
  2: 'ICP & Cost Review',
  3: 'Company Discovery',
  4: 'Website Scraping',
  5: 'Lead Qualification',
  6: 'Outreach Copywriting',
  7: 'Quality Validation',
}
