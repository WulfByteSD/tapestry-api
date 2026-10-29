import { Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import asyncHandler from '../../../../middleware/asyncHandler';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import EncounterLibraryHandler from '../handlers/EncounterLibrary.handler';
import { playerProfile } from '../utils/access';
import * as contract from '../utils/contracts';

export default class EncounterLibraryService {
  private handler = new EncounterLibraryHandler();
  private endpoint(action: (req: AuthenticatedRequest, player: string) => Promise<any>, status = 200, list = false) {
    return asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      res.setHeader('Cache-Control', 'private, no-store');
      try {
        const player = await playerProfile(req.user?._id);
        const result = await action(req, player);
        return res.status(status).json({ success: true, ...(list ? result : { payload: result }) });
      } catch (error) {
        return res.status(error instanceof ErrorUtil ? error.statusCode : 500).json({ success: false, message: error instanceof ErrorUtil ? error.message : 'Personal combatants could not be saved or loaded. Try again shortly.' });
      }
    });
  }
  list = this.endpoint((req, player) => this.handler.list(player, contract.parse(contract.listQuery, req.query)), 200, true);
  catalog = this.endpoint((req, player) => this.handler.list(player, contract.parse(contract.listQuery, req.query), true), 200, true);
  get = this.endpoint((req, player) => this.handler.get(player, req.params.libraryId));
  create = this.endpoint((req, player) => this.handler.create(player, contract.parse(contract.createTemplate, req.body).snapshot), 201);
  update = this.endpoint((req, player) => {
    const input = contract.parse(contract.editTemplate, req.body);
    return this.handler.update(player, req.params.libraryId, input.revision, input.snapshot);
  });
}
