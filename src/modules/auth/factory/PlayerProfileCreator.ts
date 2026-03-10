// services/profiles/PlayerProfileCreator.ts
import PlayerService from '../../profiles/player/service/PlayerService';
import { ProfileCreator } from '../interface/ProfileCreator';

export class PlayerProfileCreator implements ProfileCreator {
  async createProfile(userId: string, profileData: any): Promise<{ profileId: string }> {
    // Determine roles - if requesting 'storyweaver', include both 'player' and 'storyweaver'
    let roles: ('player' | 'storyweaver')[] = ['player'];

    if (profileData?.role === 'storyweaver' || profileData?.roles?.includes('storyweaver')) {
      roles = ['player', 'storyweaver'];
    }

    const playerProfile = await PlayerService.createProfile({
      ...profileData,
      user: userId,
      roles,
      displayName: profileData?.displayName,
      avatar: profileData?.avatar,
      bio: profileData?.bio,
      timezone: profileData?.timezone,
    });

    return { profileId: playerProfile._id.toString() };
  }
}
