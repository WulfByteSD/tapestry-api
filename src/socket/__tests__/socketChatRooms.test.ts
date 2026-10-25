import jwt from 'jsonwebtoken';
import { socketAuthMiddleware } from '../socketAuth';
import socketConnection from '../socketConnection';
import User from '../../modules/auth/model/Auth';
import PlayerModel from '../../modules/profiles/player/model/PlayerModel';
import { registerPresenceHandlers } from '../presence/presenceHandlers';

jest.mock('../presence/presenceHandlers', () => ({ registerPresenceHandlers: jest.fn() }));

describe('authenticated chat user rooms and legacy socket guards', () => {
  it('enrolls only the authenticated player and rejects legacy room arrays for join, leave, and send', async () => {
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-chat-socket-secret';
    const userId = '64b000000000000000000001';
    const playerId = '64b000000000000000000002';
    const token = jwt.sign({ userId }, process.env.JWT_SECRET);
    jest.spyOn(User, 'findById').mockReturnValue({
      select: () => ({ lean: async () => ({ _id: userId, isActive: true }) }),
    } as any);
    jest.spyOn(PlayerModel, 'findOne').mockReturnValue({
      lean: async () => ({ _id: playerId, displayName: 'Authenticated player', avatar: null }),
    } as any);

    const events: Record<string, (...args: any[]) => any> = {};
    const fakeSocket: any = {
      handshake: { auth: { token } },
      data: {},
      id: 'socket-1',
      join: jest.fn(),
      leave: jest.fn(),
      on: jest.fn((event: string, handler: (...args: any[]) => any) => { events[event] = handler; }),
      broadcast: { to: jest.fn(() => ({ emit: jest.fn() })) },
    };
    let connectionHandler: ((socket: any) => void) | undefined;
    const fakeIo: any = {
      use: jest.fn(),
      on: jest.fn((event: string, handler: (socket: any) => void) => { if (event === 'connection') connectionHandler = handler; }),
    };

    socketConnection(fakeIo);
    expect(fakeIo.use).toHaveBeenCalledWith(socketAuthMiddleware);
    let authError: Error | undefined;
    await socketAuthMiddleware(fakeSocket, (error) => { authError = error; });
    expect(authError).toBeUndefined();
    expect(fakeSocket.data.playerId).toBe(playerId);
    connectionHandler!(fakeSocket);

    expect(fakeSocket.join).toHaveBeenCalledWith(`chat:user:${playerId}`);
    await events.join({ roomId: [`chat:user:${'64b000000000000000000099'}`] });
    await events.join({ roomId: `chat:user:${'64b000000000000000000099'}` });
    await events.leave({ roomId: [`chat:user:${playerId}`], user: 'attacker' });
    events.sendNewMessage({ roomId: [`chat:user:${'64b000000000000000000099'}`], message: { secret: true } });
    expect(fakeSocket.join).toHaveBeenCalledTimes(1);
    expect(fakeSocket.leave).not.toHaveBeenCalled();
    expect(fakeSocket.broadcast.to).not.toHaveBeenCalled();

    await events.join({ roomId: 'campaign:presence:public-room' });
    expect(fakeSocket.join).toHaveBeenCalledWith('campaign:presence:public-room');
    expect(registerPresenceHandlers).toHaveBeenCalledWith(fakeIo, fakeSocket);
    jest.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
});
