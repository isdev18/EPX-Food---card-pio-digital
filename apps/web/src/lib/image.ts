const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = 900_000;

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
    image.src = url;
  });
}

export async function imageFileToDataUrl(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('A imagem original deve ter no máximo 8 MB.');
  const image = await loadImage(file);
  const maximumSide = 1_280;
  const scale = Math.min(1, maximumSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.82;
  let result = canvas.toDataURL('image/webp', quality);
  while (result.length > MAX_DATA_URL_LENGTH && quality > 0.42) {
    quality -= 0.08;
    result = canvas.toDataURL('image/webp', quality);
  }
  if (result.length > MAX_DATA_URL_LENGTH) throw new Error('A foto ficou muito grande. Escolha uma imagem com menos detalhes.');
  return result;
}
