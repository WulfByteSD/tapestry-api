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

    const playerProfile = await PlayerModel.findOne({ user: userId as any });
    if (!playerProfile) {
      throw new ErrorUtil('Player profile not found.', 404);
    }
    const [contentLicense, storyweaverPolicy] = await Promise.all([
      LegalPages.findOne({ type: 'content-license' }).sort({ updatedAt: -1 }),
      LegalPages.findOne({ type: 'storyweaver-policy' }).sort({ updatedAt: -1 }),
    ]);

    if (!contentLicense || !storyweaverPolicy) {
      throw new ErrorUtil('Required Storyweaver policies are missing.', 500);
    }
    console.log('Content License Version:', contentLicense.version);
    console.log('Storyweaver Policy Version:', storyweaverPolicy.version);

    // Initialize acceptedPolicies as a Map if it doesn't exist
    if (!auth.acceptedPolicies) {
      auth.acceptedPolicies = new Map() as any;
    }

    // Use Map.set() to add the new policies
    auth.acceptedPolicies.set('content-license', +contentLicense.version); 
    auth.acceptedPolicies.set('storyweaver-policy', +storyweaverPolicy.version);

    await auth.save();

    const roleSet = new Set(playerProfile.roles || []);
    roleSet.add('storyweaver');

    playerProfile.roles = Array.from(roleSet) as any;
    playerProfile.storyweaverSettings = {
      ...(playerProfile.storyweaverSettings || {}),
      officialLoreOptIn,
      enabledAt: new Date(),
    };

    await playerProfile.save();

    return {
      acceptedPolicies: auth.acceptedPolicies,
      profile: playerProfile,
    };
  }
}
