/**
 * Screenshot conditioning ahead of OCR.
 *
 * Payment apps render a lot of low-contrast grey-on-dark text, which Tesseract
 * handles poorly out of the box. We upscale small captures, convert to greyscale
 * and stretch the luminance range so the engine sees roughly the full 0-255
 * spectrum. The original File is never retained past this function.
 */

const MIN_WIDTH = 1000;
const MAX_SCALE = 2.5;
const MAX_DIMENSION = 3000;
const MIN_SPAN = 24;
const MAX_GAIN = 2.5;
/** Luminance span below which an image is considered washed out. */
const COMFORTABLE_SPAN = 120;

export interface PreprocessResult {
  blob: Blob;
  width: number;
  height: number;
}

export async function preprocess(file: Blob): Promise<PreprocessResult> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  try {
    const scale = computeScale(bitmap.width, bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    normalize(imageData.data);

    ctx.putImageData(imageData, 0, 0);

    const blob = await toBlob(canvas);
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

function computeScale(width: number, height: number): number {
  let scale = width < MIN_WIDTH ? MIN_WIDTH / width : 1;
  scale = Math.min(scale, MAX_SCALE);
  scale = Math.min(scale, MAX_DIMENSION / width, MAX_DIMENSION / height);
  return Math.max(1, scale);
}

/** Greyscale + per-channel histogram stretch, in place over RGBA bytes. */
function normalize(data: Uint8ClampedArray): void {
  const pixelCount = data.length / 4;
  if (pixelCount === 0) return;

  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const luma = (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) | 0;
    data[i] = luma;
    data[i + 1] = luma;
    data[i + 2] = luma;
    histogram[luma]!++;
  }

  // Trim 0.5% from each end so a stray black bar does not crush the range.
  const clip = Math.max(1, Math.floor(pixelCount * 0.005));
  let low = percentile(histogram, clip);
  let high = percentile(histogram, pixelCount - clip);

  // Dark-mode receipts are mostly light glyphs on a dark ground, which inverts
  // the percentile order. Swapping keeps the mapping a real stretch rather than
  // a hard threshold that would shred antialiased text.
  if (low > high) [low, high] = [high, low];

  // Only rescue genuinely washed-out captures. Stretching an image that already
  // covers most of the range thickens the antialiased edge on every glyph, which
  // closes the gap in a name like "VETRISURIYA R" and can fatten a rupee sign
  // into something Tesseract reads as a leading digit. Amplifying a good
  // screenshot does more harm than good.
  const span = high - low;
  if (span >= COMFORTABLE_SPAN) return;

  // Gain stays modest so JPEG ringing cannot be promoted into phantom glyphs.
  const gain = Math.min(255 / Math.max(span, MIN_SPAN), MAX_GAIN);
  const bias = -low * gain;

  for (let i = 0; i < data.length; i += 4) {
    const stretched = data[i]! * gain + bias;
    const clamped = stretched < 0 ? 0 : stretched > 255 ? 255 : stretched;
    data[i] = clamped;
    data[i + 1] = clamped;
    data[i + 2] = clamped;
  }
}

function percentile(histogram: Uint32Array, target: number): number {
  let seen = 0;
  for (let value = 0; value < histogram.length; value++) {
    seen += histogram[value]!;
    if (seen >= target) return value;
  }
  return 255;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))),
      'image/png',
    );
  });
}
