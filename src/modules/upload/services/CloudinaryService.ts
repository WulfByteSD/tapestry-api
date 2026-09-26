import { Response } from 'express';
import { AuthenticatedRequest } from '../../../types/AuthenticatedRequest';
import User from '../../auth/model/Auth';
import error from '../../../middleware/error';
import asyncHandler from '../../../middleware/asyncHandler';
import { ErrorUtil } from '../../../middleware/ErrorUtil';
import { CloudinaryHandler } from '../handlers/CloudinaryHandler';

export class CloudinaryService {
  private handler = new CloudinaryHandler();

  public uploadUserFile = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      console.info('[CloudinaryService] Upload request received', {
        userId: req.user?._id?.toString(),
        bodyKeys: Object.keys(req.body || {}),
        fileKeys: Object.keys(req.files || {}),
      });

      const user = await User.findById(req.user._id).select('accessKey');
      if (!user) throw new Error('User not found');

      //create an array from the files object
      const files = Object.entries(req?.files || {}).map(([key, data]: any, indx) => {
        const typeKey = key.replace('document', 'type');
        return {
          key,
          name: data.name,
          buffer: data.data,
          mimetype: data.mimetype,
          fileType: req.body[typeKey],
        };
      });

      if (files.length === 0) {
        console.warn('[CloudinaryService] Upload request contained no files');
        throw new ErrorUtil('File not found in request', 400);
      }

      console.info('[CloudinaryService] Parsed upload files', {
        count: files.length,
        files: files.map((file) => ({
          field: file.key,
          name: file.name,
          mimetype: file.mimetype,
          type: file.fileType,
          bytes: Buffer.isBuffer(file.buffer) ? file.buffer.length : 0,
        })),
      });

      let urls = [];

      // loop over files if multiple files are being uploaded
      for (const file of files) {
        const fileName = file.name || `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.txt`;
        console.info('[CloudinaryService] Preparing file upload', {
          field: file.key,
          fileName,
          mimetype: file.mimetype,
          type: file.fileType,
        });

        if (!file) throw new ErrorUtil('File not found in request', 400);
        if (!Buffer.isBuffer(file.buffer)) {
          console.warn('[CloudinaryService] Invalid upload buffer', {
            field: file.key,
            fileName,
          });
          throw new ErrorUtil(`Invalid or empty buffer for file ${fileName}`, 400);
        }

        const response = await this.handler.uploadFile(file.buffer, file.name, `users/${user.accessKey}/uploads`);
        console.info('[CloudinaryService] File uploaded to Cloudinary', {
          field: file.key,
          fileName,
          publicId: response.public_id,
          resourceType: response.resource_type,
          format: response.format,
          bytes: response.bytes,
        });

        urls.push({
          provider: 'cloudinary',
          assetKey: response.public_id,
          publicId: response.public_id,
          url: response.secure_url,
          fileName: file.name,
          type: file.fileType,
          mimeType: file.mimetype,
          resourceType: response.resource_type,
          format: response.format,
          bytes: response.bytes,
        });
      }

      console.info('[CloudinaryService] Upload request completed', {
        uploadedCount: urls.length,
        publicIds: urls.map((file) => file.publicId),
      });

      res.status(201).json({ payload: urls });
    } catch (err) {
      console.error('[CloudinaryService] Upload request failed', {
        message: err instanceof Error ? err.message : String(err),
      });
      console.error(err);
      error(err, req, res);
    }
  });

  public deleteFile = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { publicId } = req.body;
      if (!publicId) throw new ErrorUtil('Public ID is required to delete a file', 400);
      const response = await this.handler.deleteFile(publicId);
      res.status(200).json({ success: true, message: 'File deleted successfully', payload: response });
    } catch (err) {
      console.error(err);
      error(err, req, res);
    }
  });

  // non-http method for internal use
  public async deleteFileByPublicId(publicId: string): Promise<void> {
    try {
      if (!publicId) throw new ErrorUtil('Public ID is required to delete a file', 400);
      await this.handler.deleteFile(publicId);
    } catch (err) {
      console.error(err);
      throw err; // rethrow the error for further handling
    }
  }
}
