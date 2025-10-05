// Audio utilities for PDF chat frontend

let vadModule = null;
export async function loadVAD() {
  if (vadModule) return vadModule;
  try {
    vadModule = await import("@ricky0123/vad");
  } catch {
    vadModule = null;
  }
  return vadModule;
}

export function mergeFloat32(chunks) {
  const length = chunks.reduce((s, a) => s + a.length, 0);
  const out = new Float32Array(length);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export function downsampleFloat32(input, inRate, outRate) {
  if (outRate === inRate) return input;
  const ratio = inRate / outRate;
  const newLen = Math.round(input.length / ratio);
  const out = new Float32Array(newLen);
  let o = 0, i = 0;
  while (o < out.length) {
    const nextI = Math.round((o + 1) * ratio);
    let sum = 0, count = 0;
    for (; i < nextI && i < input.length; i++) {
      sum += input[i]; count++;
    }
    out[o++] = count ? sum / count : 0;
  }
  return out;
}

export function encodeWavPCM16(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };

  const frames = samples.length;
  writeString(0, "RIFF");
  view.setUint32(4, 36 + frames * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, frames * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export function rms(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}