import { eventBus } from '../../../lib/eventBus';
import CampaignEventHandler from '../handler/CampaignEvents.handler';

/**
 * @description - Handles the notification services related to campaign events.
 * @class NCampaignService
 */
export default class NCampaignService {
  constructor(private readonly handler: CampaignEventHandler = new CampaignEventHandler()) {}

  public init() {
    eventBus.subscribe('game.campaign.join_requested', this.handler.onJoinRequested);
    eventBus.subscribe('game.campaign.join_approved', this.handler.onJoinApproved);
    eventBus.subscribe('game.campaign.join_denied', this.handler.onJoinDenied);

    eventBus.subscribe('game.campaign.character_requested', this.handler.onCharacterRequested);
    eventBus.subscribe('game.campaign.character_approved', this.handler.onCharacterApproved);
    eventBus.subscribe('game.campaign.character_rejected', this.handler.onCharacterRejected);
  }
}
