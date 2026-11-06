/**
 * Reprocessa uma imagem no navegador antes do upload: corrige a orientação, limita o tamanho e
 * regrava em WebP. Regravar descarta metadados EXIF (GPS, aparelho, data), protegendo o criador.
 */
export async function reencodeImage(
  file: File,
  maxDimension: number,
  quality = 0.86,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
  if (!blob) throw new Error("encode");
  return { blob, width, height };
}
