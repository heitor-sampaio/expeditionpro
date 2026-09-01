import { scaleToFit } from './companyStore.js';

/**
 * CF-01 — prepara a logo escolhida no computador para virar configuração.
 *
 * Caminho próprio, separado do `uploadImages` das fotos: aquele converte tudo para
 * **WebP**, que o gerador de PDF não embute. Aqui a saída é sempre **PNG**, que preserva
 * transparência — logo com fundo branco por cima de papel branco não é logo.
 */

export class LogoFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LogoFileError';
  }
}

/** Maior lado depois do redimensionamento: suficiente para imprimir sem serrilhar. */
const MAX_SIDE = 600;
/** Teto do arquivo escolhido, antes de converter. Acima disso é foto, não logo. */
const MAX_INPUT_BYTES = 5 * 1024 * 1024;

export async function fileToLogoDataUri(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    throw new LogoFileError('Escolha uma imagem PNG ou JPG.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new LogoFileError('A imagem passou de 5 MB. Use uma versão menor.');
  }

  const image = await loadImage(file);
  const { width, height } = scaleToFit(image.width, image.height, MAX_SIDE, MAX_SIDE);
  if (width === 0 || height === 0) {
    throw new LogoFileError('Não foi possível ler a imagem.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new LogoFileError('Canvas indisponível neste navegador.');
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL('image/png');
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new LogoFileError('Não foi possível ler a imagem.'));
    };
    image.src = url;
  });
}
