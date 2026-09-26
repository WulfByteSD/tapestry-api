import { CloudinaryService } from "../../upload/services/CloudinaryService";

export interface UploadClient{
  uploadUserFile: (req: any, res: any) => Promise<void>;
  deleteFile: (req: any, res: any) => Promise<void>;
}

export class LocalUploadClient implements UploadClient {
  async uploadUserFile(req: any, res: any): Promise<void> {
    // Implement local file upload logic here
    throw new Error('Method not implemented.');
  }

  // TODO: This method will eventually call the file deletion logic from a seperate api service, however for
  // now we will directly call the UploadService.deleteFile method
  async deleteFile(path: string): Promise<void> {
    const service = new CloudinaryService();
    await service.deleteFileByPublicId(path);
  }
}
