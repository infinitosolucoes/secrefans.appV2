/**
 * Preparação e envio de mídia no navegador (posts e pacotes).
 * Fotos: regravadas em WebP (sem EXIF). Vídeos: MP4 como enviado + poster WebP gerado aqui.
 */
import { browserSupabase } from "@/lib/supabase-browser";
import { reencodeImage } from "@/lib/image";
import { inspectVideo } from "@/lib/video";
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  MAX_IMAGE_DIMENSION,
  MAX_SOURCE_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  POST_MEDIA_BUCKET,
  type MediaKind,
} from "./constants";

export interface UploadedMedia {
  kind: MediaKind;
  path: string;
  poster: string | null;
  width: number;
  height: number;
  duration: number | null;
  size: number;
}

export const ACCEPT_MEDIA = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(",");

export function mediaKindOf(file: File): MediaKind | null {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) return "image";
  if (ACCEPTED_VIDEO_TYPES.includes(file.type)) return "video";
  return null;
}

/** Validação rápida (tipo e tamanho) antes de aceitar o arquivo na lista. */
export function quickCheck(file: File, allowVideo = true): string | null {
  const kind = mediaKindOf(file);
  if (!kind || (kind === "video" && !allowVideo))
    return allowVideo
      ? "Use fotos JPG, PNG ou WEBP, ou vídeos MP4."
      : "Use fotos JPG, PNG ou WEBP.";
  if (kind === "image" && file.size > MAX_SOURCE_IMAGE_BYTES)
    return "Cada foto pode ter até 25 MB.";
  if (kind === "video" && file.size > MAX_VIDEO_BYTES) return "Cada vídeo pode ter até 100 MB.";
  return null;
}

/** Envia um arquivo para `<basePath>/<uuid>.<ext>` no bucket privado. Lança Error com mensagem amigável. */
export async function uploadMedia(file: File, basePath: string): Promise<UploadedMedia> {
  const supabase = browserSupabase().storage.from(POST_MEDIA_BUCKET);
  const kind = mediaKindOf(file);
  if (kind === "image") {
    const { blob, width, height } = await reencodeImage(file, MAX_IMAGE_DIMENSION);
    const path = `${basePath}/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.upload(path, blob, {
      contentType: "image/webp",
      upsert: false,
    });
    if (error) throw new Error("Falha ao enviar a foto.");
    return { kind, path, poster: null, width, height, duration: null, size: blob.size };
  }
  if (kind === "video") {
    let meta;
    try {
      meta = await inspectVideo(file);
    } catch {
      throw new Error("Não conseguimos ler este vídeo. Use MP4 (H.264).");
    }
    if (meta.duration > MAX_VIDEO_SECONDS) throw new Error("Cada vídeo pode ter até 10 minutos.");
    const id = crypto.randomUUID();
    const path = `${basePath}/${id}.mp4`;
    const poster = `${basePath}/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.upload(path, file, {
      contentType: "video/mp4",
      upsert: false,
    });
    if (error) throw new Error("Falha ao enviar o vídeo.");
    const { error: posterError } = await supabase.upload(poster, meta.poster, {
      contentType: "image/webp",
      upsert: false,
    });
    if (posterError) {
      await supabase.remove([path]);
      throw new Error("Falha ao enviar a miniatura do vídeo.");
    }
    return {
      kind,
      path,
      poster,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      size: file.size,
    };
  }
  throw new Error("Tipo de arquivo não suportado.");
}

export async function removeUploaded(items: UploadedMedia[]) {
  const paths = items.flatMap((i) => (i.poster ? [i.path, i.poster] : [i.path]));
  if (paths.length) await browserSupabase().storage.from(POST_MEDIA_BUCKET).remove(paths);
}
