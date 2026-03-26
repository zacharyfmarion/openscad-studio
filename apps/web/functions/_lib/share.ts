export interface Env {
  SHARE_KV: KVNamespace;
  SHARE_R2: R2Bucket;
}

export interface ShareRecord {
  id: string;
  code: string;
  title: string;
  createdAt: string;
  forkedFrom: string | null;
  thumbnailKey: string | null;
  thumbnailUploadTokenHash: string | null;
  codeSize: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const nanoAlphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function getRequestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

export function getShareUrl(origin: string, shareId: string): string {
  return `${origin}/s/${shareId}`;
}

export function getThumbnailUrl(origin: string, shareId: string): string {
  return `${origin}/api/share/${shareId}/thumbnail`;
}

export function sanitizeTitle(title: unknown): string {
  if (typeof title !== 'string') {
    return 'Untitled Design';
  }

  const nextTitle = title.trim().slice(0, 100);
  return nextTitle || 'Untitled Design';
}

export function validateForkedFrom(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  return /^[a-zA-Z0-9]{8}$/.test(value) ? value : null;
}

export function extractClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'anonymous'
  );
}

export async function enforceShareRateLimit(request: Request, env: Env): Promise<Response | null> {
  const ip = extractClientIp(request);
  const now = new Date();
  const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}-${now.getUTCHours()}`;
  const key = `ratelimit:${ip}:${hourKey}`;
  const current = Number((await env.SHARE_KV.get(key)) || '0');
  if (current >= 30) {
    return json({ error: 'Too many shares. Try again in a few minutes.' }, { status: 429 });
  }

  await env.SHARE_KV.put(key, String(current + 1), { expirationTtl: 3600 });
  return null;
}

export function randomShareId(length: number = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => nanoAlphabet[byte % nanoAlphabet.length]).join('');
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return bytesToBase64Url(bytes);
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export async function compressSource(code: string): Promise<string> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  await writer.write(encoder.encode(code));
  await writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

export async function decompressSource(payload: string): Promise<string> {
  const bytes = base64ToBytes(payload);
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return decoder.decode(buffer);
}

export async function parseShareRecord(value: string | null): Promise<ShareRecord | null> {
  if (!value) {
    return null;
  }

  return JSON.parse(value) as ShareRecord;
}

export async function readShare(env: Env, shareId: string): Promise<ShareRecord | null> {
  return parseShareRecord(await env.SHARE_KV.get(`share:${shareId}`));
}

export async function writeShare(env: Env, share: ShareRecord): Promise<void> {
  await env.SHARE_KV.put(`share:${share.id}`, JSON.stringify(share));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
