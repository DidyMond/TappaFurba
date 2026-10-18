// Tipi di `brands.mjs` (lo importano i test TypeScript; lo script gira in Node senza compilazione).
export const SOURCE_URL: string;
export const ATTRIBUTION: string;
export const PLACEHOLDER_REFERENCE: string;
export function normalizeBrand(name: string): string;
export function sha256(data: Buffer | string): string;

export interface LogoEntry {
  id: number;
  name: string;
  key: string;
  png: Buffer;
}
export interface ExcludedBrands {
  placeholder: string[];
  noLogo: string[];
  collisions: string[];
}
export interface AllLogosPayload {
  loghi: Array<{ bandieraId: number; bandiera: string; logoMarkerList?: Array<{ tipoFile: string; estensione?: string; content: string }> | null }>;
}
export function selectLogos(payload: AllLogosPayload): { entries: LogoEntry[]; excluded: ExcludedBrands };
export function compressLogo(sharp: unknown, png: Buffer): Promise<Buffer>;
export function buildManifest(args: { entries: LogoEntry[]; excluded: ExcludedBrands; sha: string; downloadedAt: string }): {
  source: string;
  downloadedAt: string;
  sha256: string;
  attribution: string;
  count: number;
  excluded: ExcludedBrands;
  brands: Record<string, string>;
};
