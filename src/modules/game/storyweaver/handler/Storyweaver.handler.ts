import Auth from '../../../auth/model/Auth';
import LegalPages from '../../../auth/model/LegalPages';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';

export interface BecomeStoryweaverResult {
  acceptedPolicies: any;
  profile: any;
}

export class StoryweaverHandler {
  async becomeStoryweaver(userId: string, officialLoreOptIn: boolean = false): Promise<BecomeStoryweaverResult> {
    const auth = await Auth.findById(userId);
    if (!auth) {
      throw new ErrorUtil('User not found.', 404);
    }

    const playerProfileId = auth.profileRefs?.player;
    if (!playerProfileId) {
      throw new ErrorUtil('Player profile is required before becoming a Storyweaver.', 400);
    }

    const [contentLicense, storyweaverPolicy] = await Promise.all([
      LegalPages.findOne({ type: 'content-license' }).sort({ updatedAt: -1 }),
      LegalPages.findOne({ type: 'storyweaver-policy' }).sort({ updatedAt: -1 }),
    ]);

    if (!contentLicense || !storyweaverPolicy) {
      throw new ErrorUtil('Required Storyweaver policies are missing.', 500);
    }

    const acceptedPolicies = {
      ...(auth.acceptedPolicies || {}),
      'content-license': Number(contentLicense.version),
      'storyweaver-policy': Number(storyweaverPolicy.version),
    };

    auth.acceptedPolicies = acceptedPolicies as any;
    await auth.save();

    const player = await PlayerModel.findById(playerProfileId);
    if (!player) {
      throw new ErrorUtil('Player profile not found.', 404);
    }

    const roleSet = new Set(player.roles || []);
    roleSet.add('storyweaver');

    player.roles = Array.from(roleSet) as any;
    player.storyweaverSettings = {
      ...(player.storyweaverSettings || {}),
      officialLoreOptIn,
      enabledAt: new Date(),
    };

    await player.save();

    return {
      acceptedPolicies: auth.acceptedPolicies,
      profile: player,
    };
  }
}
