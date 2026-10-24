import { PassThrough, Readable } from 'stream';
import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';
import AdventureStorageHandler from '../handlers/AdventureStorage.handler';

jest.mock('../../../upload/handlers/CloudinaryHandler', () => ({ CloudinaryHandler: jest.fn() }));
jest.mock('cloudinary', () => ({ v2: { uploader: { upload_stream: jest.fn(), destroy: jest.fn() }, utils: { private_download_url: jest.fn() } } }));
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
const asset = { publicId: 'adventures/module/map/private.pdf', resourceType: 'raw' as const, format: 'pdf', contentType: 'application/pdf', bytes: 10 };

beforeEach(() => jest.resetAllMocks());
describe('protected adventure attachments', () => {
  it('uploads as authenticated raw assets and never exposes provider delivery URLs', async () => {
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation((options, callback) => {
      const stream = new PassThrough(); stream.resume();
      stream.on('finish', () => callback(null, { public_id: options.public_id, type: 'authenticated', resource_type: 'raw', bytes: 10, secure_url: 'SECRET_PROVIDER_URL' }));
      return stream;
    });
    const result = await new AdventureStorageHandler().upload('module', 'map', Buffer.from('%PDF-1.7\n'));
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(expect.objectContaining({ type: 'authenticated', resource_type: 'raw', overwrite: false }), expect.any(Function));
    expect(result.publicId).toMatch(/^adventures\/module\/map\/.+\.pdf$/);
    expect(JSON.stringify(result)).not.toContain('SECRET_PROVIDER_URL');
  });
  it.each([Buffer.alloc(0), Buffer.alloc(10 * 1024 * 1024 + 1), Buffer.from('<svg onload="bad"/>'), Buffer.from('<html>bad</html>')])('rejects unsupported or oversized bytes before provider access', async bytes => {
    await expect(new AdventureStorageHandler().upload('module', 'map', bytes)).rejects.toMatchObject({ statusCode: 400 });
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });
  it('uses a short-lived signed authenticated download server-side without following redirects', async () => {
    const body = Readable.from(Buffer.from('bytes'));
    (cloudinary.utils.private_download_url as jest.Mock).mockReturnValue('https://api.cloudinary.com/signed-secret');
    (axios.get as jest.Mock).mockResolvedValue({ data: body });
    expect(await new AdventureStorageHandler().open(asset)).toBe(body);
    expect(cloudinary.utils.private_download_url).toHaveBeenCalledWith(asset.publicId, '', expect.objectContaining({ type: 'authenticated', resource_type: 'raw', expires_at: expect.any(Number) }));
    expect(axios.get).toHaveBeenCalledWith('https://api.cloudinary.com/signed-secret', { responseType: 'stream', maxRedirects: 0, timeout: 15000 });
  });
  it('does not leak a signed URL through upstream error messages', async () => {
    (cloudinary.utils.private_download_url as jest.Mock).mockReturnValue('SIGNED_SECRET');
    (axios.get as jest.Mock).mockRejectedValue(new Error('Failed SIGNED_SECRET'));
    await expect(new AdventureStorageHandler().open(asset)).rejects.toMatchObject({ statusCode: 502, message: 'Protected attachment unavailable' });
  });
  it('sanitizes synchronous signing and upload setup failures too', async () => {
    (cloudinary.utils.private_download_url as jest.Mock).mockImplementation(() => { throw new Error('SIGNED_SECRET'); });
    await expect(new AdventureStorageHandler().open(asset)).rejects.toMatchObject({ statusCode: 502, message: 'Protected attachment unavailable' });
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(() => { throw new Error('PROVIDER_SECRET'); });
    await expect(new AdventureStorageHandler().upload('module', 'map', Buffer.from('%PDF-1.7\n')))
      .rejects.toMatchObject({ statusCode: 502, message: 'Protected attachment upload failed' });
  });
  it.each([{ type: 'upload', resource_type: 'raw' }, { type: 'authenticated', resource_type: 'image' }])('rejects unexpected provider storage classification %j', async classification => {
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation((_options, callback) => {
      const stream = new PassThrough(); stream.resume();
      stream.on('finish', () => callback(null, { public_id: 'UNSAFE_SOURCE', bytes: 9, ...classification }));
      return stream;
    });
    await expect(new AdventureStorageHandler().upload('module', 'map', Buffer.from('%PDF-1.7\n')))
      .rejects.toMatchObject({ statusCode: 502, message: 'Protected attachment upload failed' });
  });
});
