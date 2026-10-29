import { Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import asyncHandler from '../../../../middleware/asyncHandler';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import EncounterDraftHandler from '../handlers/EncounterDraft.handler';
import { playerProfile } from '../utils/access';
import * as contract from '../utils/contracts';

// Generic CRUD hooks do not carry campaign/actor scope or atomic revisions. These endpoints
// deliberately expose only the scoped handler methods, never inherited unscoped CRUD routes.
export default class EncounterDraftService {
  private handler = new EncounterDraftHandler();
  
  private endpoint(action: (req: AuthenticatedRequest, player: string) => Promise<any>, status = 200, list = false) {
    return asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      res.setHeader('Cache-Control', 'private, no-store');
      try {
        const player = await playerProfile(req.user?._id);
        const result = await action(req, player);
        return res.status(status).json({ success: true, ...(list ? result : { payload: result }) });
      } catch (error) {
        return res
          .status(error instanceof ErrorUtil ? error.statusCode : 500)
          .json({ success: false, message: error instanceof ErrorUtil ? error.message : 'Encounter preparation could not be saved or loaded. Try again shortly.' });
      }
    });
  }
  list = this.endpoint((req, player) => this.handler.list(player, req.params.campaignId, contract.parse(contract.listQuery, req.query)), 200, true);
  get = this.endpoint((req, player) => this.handler.get(player, req.params.campaignId, req.params.encounterId));
  characters = this.endpoint((req, player) => this.handler.characters(player, req.params.campaignId));
  create = this.endpoint((req, player) => this.handler.create(player, req.params.campaignId, contract.parse(contract.createDraft, req.body)), 201);
  update = this.endpoint((req, player) => this.handler.update(player, req.params.campaignId, req.params.encounterId, contract.parse(contract.editDraft, req.body)));
  add = this.endpoint((req, player) => this.handler.add(player, req.params.campaignId, req.params.encounterId, contract.parse(contract.addParticipant, req.body)));
  updateTurnOrder = this.endpoint((req, player) => this.handler.updateTurnOrder(player, req.params.campaignId, req.params.encounterId, contract.parse(contract.updateTurnOrder, req.body)));
  editParticipant = this.endpoint((req, player) => {
    const input = contract.parse(contract.editParticipant, req.body);
    return this.handler.changeParticipant(player, req.params.campaignId, req.params.encounterId, req.params.participantId, input.revision, 'edit', input.snapshot);
  });
  removeParticipant = this.endpoint((req, player) =>
    this.handler.changeParticipant(
      player,
      req.params.campaignId,
      req.params.encounterId,
      req.params.participantId,
      contract.parse(contract.revisionOnly, req.body).revision,
      'remove'
    )
  );
  duplicateParticipant = this.endpoint((req, player) =>
    this.handler.changeParticipant(
      player,
      req.params.campaignId,
      req.params.encounterId,
      req.params.participantId,
      contract.parse(contract.revisionOnly, req.body).revision,
      'duplicate'
    )
  );
}
