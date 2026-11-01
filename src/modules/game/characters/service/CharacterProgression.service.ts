import { Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import asyncHandler from '../../../../middleware/asyncHandler';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import CharacterProgressionHandler from '../handlers/CharacterProgression.handler';
import { buildEffectiveAbilities } from '../helpers/buildEffectiveAbilities';

export default class CharacterProgressionService {
  private handler = new CharacterProgressionHandler();
  private endpoint(action: 'progression' | 'advance' | 'resolve' | 'award' | 'reset') {
    return asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const player = await this.handler.player(req.user._id);
        const id = req.params.id ?? '';
        let payload: any;
        if (action === 'award') payload = await this.handler.award(player, id, req.body);
        else if (action === 'resolve') payload = await this.handler.resolve(String(player._id), id, req.params.awardId ?? '', req.body);
        else if (action === 'progression') payload = await this.handler.progression(String(player._id), id);
        else {
          payload = action === 'reset' ? await this.handler.reset(String(player._id), id, req.body) : await this.handler.advance(String(player._id), id, req.body);
          payload.derived = { effectiveAbilities: await buildEffectiveAbilities({ learnedAbilities: payload.sheet.learnedAbilities, inventory: payload.sheet.inventory }) };
        }
        return res.status(200).json({ success: true, payload });
      } catch (error) {
        return res.status(error instanceof ErrorUtil ? error.statusCode : 500).json({ success: false, message: error instanceof ErrorUtil ? error.message : 'Could not save progression. Retry with the same selection.' });
      }
    });
  }
  progression = this.endpoint('progression');
  advance = this.endpoint('advance');
  resolve = this.endpoint('resolve');
  award = this.endpoint('award');
  reset = this.endpoint('reset');
}
