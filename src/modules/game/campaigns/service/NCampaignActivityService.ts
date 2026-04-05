import { eventBus } from '../../../lib/eventBus';
import CampaignActivityEventHandler from '../handlers/CampaignActivityEventHandler';

/**
 * @description Subscribes to game events and writes campaign activity feed entries.
 * Mirrors NCampaignService — init() wires all subscriptions.
 */
export default class NCampaignActivityService {
  constructor(private readonly handler: CampaignActivityEventHandler = new CampaignActivityEventHandler()) {}

  public init() {
    eventBus.subscribe('game.dice.rolled', this.handler.onDiceRolled);
    eventBus.subscribe('game.campaign.member_joined', this.handler.onMemberJoined);
    eventBus.subscribe('game.campaign.member_left', this.handler.onMemberLeft);
    eventBus.subscribe('game.campaign.character_approved', this.handler.onCharacterAttached);
    eventBus.subscribe('game.campaign.character_detached', this.handler.onCharacterDetached);
  }
}
