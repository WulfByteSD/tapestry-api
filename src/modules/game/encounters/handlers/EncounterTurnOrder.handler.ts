import { Types } from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { Participant, TurnOrder, TurnOrderCommand } from '../utils/contracts';

/** Turn slots are independent of roster position and snapshot action statistics. */
export default class EncounterTurnOrderHandler {
  read(draft: { participants: Participant[]; turnOrder?: TurnOrder }): TurnOrder {
    if (draft.turnOrder) return JSON.parse(JSON.stringify(draft.turnOrder));
    return { round: 1, slots: draft.participants.map((item) => ({ id: item.id, participantId: item.id })), currentSlotId: null };
  }

  append(order: TurnOrder, participantId: string): TurnOrder {
    if (order.slots.length >= 200) throw new ErrorUtil('An encounter can contain at most 200 turn slots. Remove a turn before adding another.', 400);
    return { ...order, slots: [...order.slots, { id: new Types.ObjectId().toHexString(), participantId }] };
  }

  remove(order: TurnOrder, removedIds: Set<string>): TurnOrder {
    const slots = order.slots.filter((slot) => !removedIds.has(slot.id));
    let currentSlotId = order.currentSlotId;
    if (currentSlotId && removedIds.has(currentSlotId)) {
      const index = order.slots.findIndex((slot) => slot.id === currentSlotId);
      const following = [...order.slots.slice(index + 1), ...order.slots.slice(0, index)];
      currentSlotId = following.find((slot) => !removedIds.has(slot.id))?.id ?? null;
    }
    return { ...order, slots, currentSlotId };
  }

  execute(order: TurnOrder, participants: Participant[], command: TurnOrderCommand): TurnOrder {
    switch (command.action) {
      case 'add':
        if (!participants.some((item) => item.id === command.participantId)) throw new ErrorUtil('Participant not found.', 404);
        return this.append(order, command.participantId);
      case 'reorder': {
        const slots = new Map(order.slots.map((slot) => [slot.id, slot]));
        if (command.slotIds.length !== slots.size || new Set(command.slotIds).size !== slots.size || command.slotIds.some((id) => !slots.has(id))) {
          throw new ErrorUtil('Supply every current turn slot exactly once.', 400);
        }
        return { ...order, slots: command.slotIds.map((id) => slots.get(id)!) };
      }
      case 'remove':
      case 'select':
        if (!order.slots.some((slot) => slot.id === command.slotId)) throw new ErrorUtil('Turn slot not found.', 404);
        return command.action === 'select' ? { ...order, currentSlotId: command.slotId } : this.remove(order, new Set([command.slotId]));
      case 'advance':
      case 'next-round': {
        if (!order.slots.length) throw new ErrorUtil('Add a turn before starting or advancing a round.', 400);
        const nextIndex = order.currentSlotId === null ? 0 : order.slots.findIndex((slot) => slot.id === order.currentSlotId) + 1;
        const nextRound = command.action === 'next-round' || nextIndex === order.slots.length;
        if (nextRound && order.round >= 1000000) throw new ErrorUtil('This encounter has reached the maximum round number.', 400);
        return { ...order, round: order.round + (nextRound ? 1 : 0), currentSlotId: order.slots[nextRound ? 0 : nextIndex].id };
      }
    }
  }
}
