import { randomUUID } from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';
import { Readable } from 'stream';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { CloudinaryHandler } from '../../../upload/handlers/CloudinaryHandler';
import { ProtectedAsset } from '../types/adventure.contracts';

/** All uploads use authenticated delivery. Never accept client-supplied URLs or public IDs. */
export default class AdventureStorageHandler {
  private configure() {
    new CloudinaryHandler();
  }

  async upload(adventureId: string, resourceId: string, data: Buffer): Promise<ProtectedAsset> {
    if (!data.length || data.length > 10 * 1024 * 1024) throw new ErrorUtil('Attachment must be between 1 byte and 10 MB', 400);
    const signature = data.subarray(0, 12);
    const kind = signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? ['png', 'image/png']
      : signature[0] === 255 && signature[1] === 216 && signature[2] === 255
        ? ['jpg', 'image/jpeg']
        : signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP'
          ? ['webp', 'image/webp']
          : signature.toString('ascii', 0, 5) === '%PDF-'
            ? ['pdf', 'application/pdf']
            : null;
    if (!kind) throw new ErrorUtil('Only PNG, JPEG, WebP, or PDF attachments are supported', 400);
    // Raw authenticated storage preserves the supplied bytes and avoids public transformations.
    const publicId = `adventures/${adventureId}/${resourceId}/${randomUUID()}.${kind[0]}`;
    return new Promise((resolve, reject) => {
      try {
        this.configure();
        const stream = cloudinary.uploader.upload_stream({ public_id: publicId, type: 'authenticated', resource_type: 'raw', overwrite: false }, (error, result) => {
          if (error || !result || result.type !== 'authenticated' || result.resource_type !== 'raw') return reject(new ErrorUtil('Protected attachment upload failed', 502));
          resolve({ publicId: result.public_id, resourceType: 'raw', format: kind[0], contentType: kind[1], bytes: result.bytes });
        });
        stream.on('error', () => reject(new ErrorUtil('Protected attachment upload failed', 502)));
        stream.end(data);
      } catch {
        reject(new ErrorUtil('Protected attachment upload failed', 502));
      }
    });
  }

  async discard(asset: ProtectedAsset) {
    this.configure();
    await cloudinary.uploader.destroy(asset.publicId, { type: 'authenticated', resource_type: asset.resourceType });
  }

  async open(asset: ProtectedAsset): Promise<Readable> {
    try {
      this.configure();
      // Signed download endpoint is consumed by the backend only, never returned or redirected to the client.
      const url = cloudinary.utils.private_download_url(asset.publicId, asset.resourceType === 'raw' ? '' : asset.format, {
        resource_type: asset.resourceType,
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + 60,
        attachment: true,
      });
      const upstream = await axios.get<Readable>(url, { responseType: 'stream', maxRedirects: 0, timeout: 15000 });
      return upstream.data;
    } catch {
      // Axios errors contain the signed request URL; never expose them through generic middleware.
      throw new ErrorUtil('Protected attachment unavailable', 502);
    }
  }
}
