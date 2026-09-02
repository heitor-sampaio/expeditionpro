import { supabase } from '../auth/supabaseClient.js';
import { SIGNED_URL_TTL_SECONDS } from './signedUrlTtl.js';

/**
 * Pipeline de imagem compartilhado (comunidade CO-09, galeria de roteiro RO-01). Comprime
 * **no cliente** antes de subir: redimensiona para 2560px no maior lado e converte para
 * WebP q80 (~400 KB), gera thumbnail de 480px. Sobe para um bucket privado, com path
 * prefixado por `tenant_id` (a policy de Storage barra fora do próprio tenant). Devolve o path.
 *
 * HEIC (padrão do iPhone) o navegador não decodifica sozinho — convertemos com `heic2any`
 * (importado sob demanda para não pesar o bundle de quem não precisa) antes de comprimir.
 */

const FULL_MAX = 2560;
const THUMB_MAX = 480;
const QUALITY = 0.8;

export interface UploadedImage {
  readonly storagePath: string;
}

export class MediaError extends Error {}

export async function uploadImages(
  files: readonly File[],
  bucket: string,
): Promise<UploadedImage[]> {
  const tenantId = await currentTenantId();
  const out: UploadedImage[] = [];
  for (const file of files) {
    out.push(await uploadOne(file, tenantId, bucket));
  }
  return out;
}

async function uploadOne(file: File, tenantId: string, bucket: string): Promise<UploadedImage> {
  const source = await toDecodable(file);
  const image = await loadImage(source);
  const full = await toWebp(image, FULL_MAX);
  const thumb = await toWebp(image, THUMB_MAX);
  const id = crypto.randomUUID();
  const path = `${tenantId}/${id}.webp`;
  const thumbPath = `${tenantId}/${id}_thumb.webp`;

  const up = await supabase.storage
    .from(bucket)
    .upload(path, full, { contentType: 'image/webp', upsert: false });
  if (up.error) throw new MediaError(`Falha ao enviar a foto: ${up.error.message}`);
  await supabase.storage
    .from(bucket)
    .upload(thumbPath, thumb, { contentType: 'image/webp', upsert: false });
  return { storagePath: path };
}

/** Thumbnail de um path de mídia (mesma id + `_thumb`). */
export function thumbPathOf(storagePath: string): string {
  return storagePath.replace(/\.webp$/, '_thumb.webp');
}

/** URL assinada de curta validade para exibir uma mídia de um bucket privado. */
export async function signedUrlFor(storagePath: string, bucket: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

/**
 * Apaga as imagens do bucket (a cheia e a miniatura). Usada quando uma foto sai da galeria:
 * sem isso o arquivo ficaria órfão no Storage, ocupando espaço para sempre. A policy de
 * DELETE do bucket é escopada pelo tenant, então só apaga o que é do próprio tenant.
 */
export async function removeImages(storagePaths: readonly string[], bucket: string): Promise<void> {
  if (storagePaths.length === 0) return;
  const all = storagePaths.flatMap((path) => [path, thumbPathOf(path)]);
  await supabase.storage.from(bucket).remove(all);
}

/**
 * URLs assinadas em lote (uma ida à rede para todas as fotos). É o que permite trocar a
 * foto em destaque sem esperar: a URL já está em mãos quando o clique acontece.
 */
export async function signedUrlsFor(
  storagePaths: readonly string[],
  bucket: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (storagePaths.length === 0) return out;
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrls([...storagePaths], SIGNED_URL_TTL_SECONDS);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}

async function currentTenantId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const meta = (data.session?.user.app_metadata ?? {}) as { tenant_id?: string };
  if (!meta.tenant_id) throw new MediaError('Sessão sem tenant — faça login de novo.');
  return meta.tenant_id;
}

/** Converte HEIC/HEIF (que o navegador não decodifica) para JPEG antes de desenhar. */
async function toDecodable(file: File): Promise<Blob> {
  const isHeic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!isHeic) return file;
  try {
    const heic2any = (await import('heic2any')).default as (opts: {
      blob: Blob;
      toType?: string;
      quality?: number;
    }) => Promise<Blob | Blob[]>;
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    return Array.isArray(out) ? out[0]! : out;
  } catch {
    throw new MediaError('Não foi possível converter a foto HEIC. Tente exportar como JPG.');
  }
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new MediaError('Não foi possível ler a imagem.'));
    };
    img.src = url;
  });
}

function toWebp(img: HTMLImageElement, maxSide: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new MediaError('Canvas indisponível neste navegador.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new MediaError('Falha ao comprimir a foto.'))),
      'image/webp',
      QUALITY,
    );
  });
}
