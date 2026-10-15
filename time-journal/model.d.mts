export const TIME_STEP: number
export function normalizeRecord(record: unknown): unknown
export function validateBlock(block: { id: string; start: number; end: number; category: string }, blocks: { id: string; start: number; end: number; category: string }[]): string
export function splitInterval(start: number, end: number): { start: number; end: number }[]
export function snapMinute(minute: number): number
export function nextOpenSlot(blocks: { start: number; end: number }[], preferred?: number): { start: number; end: number } | null
export function categoryPalette(totals: Record<string, number>): { id: string; color: string }[]
export function distributionSegments(totals: Record<string, number>): { id: string; color: string; minutes: number; offset: number; percent: number }[]
