export const MM_PER_INCH = 25.4;
export const CM_PER_INCH = 2.54;
 

export const MIN_PPI = 30;
export const MAX_PPI = 400;
 
export type Unit = 'in' | 'cm';
export type SizeMode = 'diagonal' | 'widthHeight';
 
// ---------- reference objects (in millimetres) ----------
export type RefObject = {
  id: string;
  name: string;
  widthMm: number;  
  heightMm: number;
  round?: boolean;
};
 
export const OBJECTS: RefObject[] = [
  { id: 'card', name: 'Bank or credit card', widthMm: 85.6, heightMm: 53.98 },
  { id: 'eur1', name: '€1 coin', widthMm: 23.25, heightMm: 23.25, round: true },
  { id: 'eur2', name: '€2 coin', widthMm: 25.75, heightMm: 25.75, round: true },
  { id: 'banana', name: 'Banana', widthMm: 180, heightMm: 60 },
];
 
export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}
 
// ---------- helpers ----------

export function positive(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
}
 
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
 
export function isPlausible(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= MIN_PPI && value <= MAX_PPI;
}
 
// ---------- manual input ----------
function toInches(value: number, unit: Unit): number {
  return unit === 'cm' ? value / CM_PER_INCH : value;
}
 
export function diagonalInches(
  sizeMode: SizeMode,
  unit: Unit,
  diagonal: unknown,
  width: unknown,
  height: unknown
): number | null {
  if (sizeMode === 'diagonal') {
    const d = positive(diagonal);
    return d === null ? null : toInches(d, unit);
  }
  const w = positive(width);
  const h = positive(height);
  if (w === null || h === null) return null;
  return toInches(Math.sqrt(w * w + h * h), unit); 
}
 
// PPI = diagonal in pixels / diagonal in inches.
// The resolution typed in is the real (device) resolution, so we divide by
// devicePixelRatio at the end to get CSS pixels per inch.
export function ppiFromManual(
  diagInches: number | null,
  resWidth: unknown,
  resHeight: unknown,
  pixelRatio: number
): number | null {
  const w = positive(resWidth);
  const h = positive(resHeight);
  if (diagInches === null || w === null || h === null) return null;
  const devicePpi = Math.sqrt(w * w + h * h) / diagInches;
  return devicePpi / pixelRatio;
}
 
// ---------- Mode 2: physical object ----------
// PPI = pixels the box is wide / inches the real object is wide.
export function ppiFromObject(pxWidth: number, objectWidthMm: number): number {
  return pxWidth / mmToInches(objectWidthMm);
}
 
// ---------- Ruler preview ----------
export type Tick = { x: number; size: 'major' | 'mid' | 'minor'; label: string };
 
// Makes the little lines of a ruler.
//   steps      how many small steps the ruler has (50 for 50 mm)
//   stepPx     width of one small step in pixels
//   majorEvery every Nth step is a long line with a number (10 -> every cm)
//   midEvery   every Nth step is a medium line (5 -> every half cm)
export function makeRuler(steps: number, stepPx: number, majorEvery: number, midEvery: number): Tick[] {
  const ticks: Tick[] = [];
  for (let i = 0; i <= steps; i++) {
    const isMajor = i % majorEvery === 0;
    ticks.push({
      x: i * stepPx,
      size: isMajor ? 'major' : i % midEvery === 0 ? 'mid' : 'minor',
      label: isMajor ? String(i / majorEvery) : ''
    });
  }
  return ticks;
}
 