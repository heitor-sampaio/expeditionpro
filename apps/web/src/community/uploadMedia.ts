import { uploadImages, signedUrlFor, thumbPathOf, MediaError } from '../ui/uploadImages.js';
import type { UploadedImage } from '../ui/uploadImages.js';

/**
 * Mídia da comunidade (§5.12 · CO-09): usa o pipeline compartilhado (`ui/uploadImages`) fixado
 * no bucket privado `community`. Mantém a API que os componentes da comunidade já consomem.
 */

export type UploadedMedia = UploadedImage;
export { MediaError, thumbPathOf };

export function uploadCommunityMedia(files: readonly File[]): Promise<UploadedMedia[]> {
  return uploadImages(files, 'community');
}

export function signedUrl(storagePath: string): Promise<string | null> {
  return signedUrlFor(storagePath, 'community');
}
