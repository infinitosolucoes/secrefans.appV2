/**
 * Lê duração e dimensões de um MP4 no navegador e gera a miniatura (poster) em WebP a partir de
 * um quadro próximo de 1s. Sem transcodificação: o arquivo é enviado como está (worker FFmpeg depois).
 */
export async function inspectVideo(
  file: File,
  posterMaxDimension = 1280,
): Promise<{ duration: number; width: number; height: number; poster: Blob }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("metadata"));
    });
    let duration = video.duration;
    // MP4 fragmentado (gravado por navegador/apps) chega sem duração no cabeçalho:
    // buscar um tempo enorme força o navegador a calcular a duração real.
    if (!Number.isFinite(duration)) {
      duration = await new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("duration")), 8000);
        video.ondurationchange = () => {
          if (Number.isFinite(video.duration)) {
            clearTimeout(timeout);
            resolve(video.duration);
          }
        };
        video.currentTime = 1e7;
      });
    }
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("duration");
    const target = Math.min(1, duration / 2);
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("seek"));
      video.currentTime = target;
    });
    const width = video.videoWidth || 1;
    const height = video.videoHeight || 1;
    const scale = Math.min(1, posterMaxDimension / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const poster = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.82),
    );
    if (!poster) throw new Error("poster");
    return { duration: Math.max(1, Math.round(duration)), width, height, poster };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
