// uploadPdfToCloudinary.js (fixed)
export async function uploadPdfToCloudinary(file, options = {}) {
  const cloudName = options.cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = options.uploadPreset || process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  const folder = options.folder;
  const publicId = options.publicId;
  const tags = options.tags;

  if (!cloudName) throw new Error('Missing Cloudinary cloud name');
  if (!uploadPreset) throw new Error('Missing Cloudinary upload preset');
  if (!file) throw new Error('No file provided for upload');

  // Force using the raw endpoint (PDFs/documents)
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  // Only include allowed unsigned params
  if (folder) formData.append('folder', folder);
  if (publicId) formData.append('public_id', publicId);
  if (tags) formData.append('tags', Array.isArray(tags) ? tags.join(',') : tags);

  if (options.context && typeof options.context === 'object') {
    const ctx = Object.entries(options.context).map(([k, v]) => `${k}=${v}`).join('|');
    formData.append('context', ctx);
  }

  const resp = await fetch(url, { method: 'POST', body: formData });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    // Try parse JSON error if any
    try {
      const j = JSON.parse(text || '{}');
      throw new Error(`Cloudinary upload failed: ${resp.status} ${JSON.stringify(j)}`);
    } catch {
      throw new Error(`Cloudinary upload failed: ${resp.status} ${text}`);
    }
  }

  const json = await resp.json();
  console.log('upload response:', json);
  return json;
}


// Legacy function for backward compatibility
export async function uploadToCloudinary(file, options = {}) {
  return uploadPdfToCloudinary(file, options);
}