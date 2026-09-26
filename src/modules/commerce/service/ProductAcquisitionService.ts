import { Response } from 'express';
import asyncHandler from '../../../middleware/asyncHandler';
import { AuthenticatedRequest } from '../../../types/AuthenticatedRequest';
import ProductAcquisitionHandler from '../handlers/ProductAcquisition.handler';

export default class ProductAcquisitionService {
  private readonly handler = new ProductAcquisitionHandler();

  claim = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await this.handler.claim({
      userId: req.user._id.toString(),
      productId: req.params.productId,
      acquisitionType: 'claim',
    });

    return res.status(200).json({
      success: true,
      payload: result,
    });
  });
}
