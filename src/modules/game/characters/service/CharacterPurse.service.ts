import { Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import asyncHandler from '../../../../middleware/asyncHandler';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import CharacterProgressionHandler from '../handlers/CharacterProgression.handler';
import CharacterPurseHandler from '../handlers/CharacterPurse.handler';

export default class CharacterPurseService {
  private handler = new CharacterPurseHandler();
  private endpoint(change: boolean) {
    return asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const player = await new CharacterProgressionHandler().player(req.user._id);
        const payload = change ? await this.handler.change(player, req.params.id ?? '', req.body) : await this.handler.get(player, req.params.id ?? '', req.query);
        return res.status(200).json({ success: true, payload });
      } catch (error) {
        return res.status(error instanceof ErrorUtil ? error.statusCode : 500).json({ success: false, message: error instanceof ErrorUtil ? error.message : 'Could not save the Purse change. Retry with the same request.' });
      }
    });
  }
  get = this.endpoint(false);
  change = this.endpoint(true);
}
