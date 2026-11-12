import { writable } from 'svelte/store';
 
const STORAGE_KEY = 'screenPpi';
 

export const ppi = writable<number | null>(null);
 

export function loadPpi(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved > 0) ppi.set(saved);
  } catch {

  }
}
 
export function savePpi(value: number): void {
  ppi.set(value);
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    
  }
}
 

export function cmToPx(cm: number, pixelsPerInch: number): number {
  return (cm / 2.54) * pixelsPerInch;
}
export function pxToCm(px: number, pixelsPerInch: number): number {
  return (px / pixelsPerInch) * 2.54;
}