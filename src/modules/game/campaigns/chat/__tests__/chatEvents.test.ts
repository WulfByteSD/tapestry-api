import { isChatReservedRoom } from '../chatEvents';

describe('legacy Socket.IO chat room guard', () => {
  it('reserves the server-enrolled chat room namespace', () => {
    expect(isChatReservedRoom('chat:user:player-id')).toBe(true);
    expect(isChatReservedRoom('chat:campaign:channel-id')).toBe(true);
    expect(isChatReservedRoom('campaign:presence:campaign-id')).toBe(false);
    expect(isChatReservedRoom(['chat:user:another-player'])).toBe(true);
    expect(isChatReservedRoom(undefined)).toBe(true);
  });
});
