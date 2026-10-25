import SupportTicket, { SupportType } from '../models/Support'; // Adjust path as needed
import SupportGroup from '../models/SupportGroups'; 
import { ErrorUtil } from '../../../middleware/ErrorUtil';
import SupportMessage, { SupportMessageType } from '../models/SupportMessage';
import mongoose from 'mongoose';
import { CRUDHandler } from '../../../utils/baseCRUD'; 
import Support from '../models/Support'; 

export class TicketHandler extends CRUDHandler<SupportType> {
  constructor() {
    super(SupportTicket);
  }
  // Create a new support ticket
  async create(data: any): Promise<SupportType> {
    const newTicket = await SupportTicket.create({
      ...data,
      requester: data.user ? data.user._id : null,
      requesterDetails: {
        email: data.user?.email || data.email || '',
        fullName: data.user?.fullName || data.fullName || '',
      },
    });

    if (!newTicket) {
      throw new ErrorUtil('Ticket not created', 400);
    }
    // next we need to find all of our support groups and assign the ticket to the group
    // that matches the category, the Category field is an array of strings, so find
    // all groups that match the category strings
    const groups = await SupportGroup.find({
      name: { $in: newTicket.category },
    });

    // if no groups are found, return a 400 error something went wrong...
    if (!groups.length) {
      throw new ErrorUtil('No Support Groups Found', 401);
    }
    //update the ticket with the groups that were found
    newTicket.groups = groups.map((group) => group._id) as any;

    // next we want to create a message for the ticket
    const message = await SupportMessage.create({
      ticket: newTicket._id,
      message: data.message,
      // These fields are technically optional, as the messages will be attached
      // to a ticket, which will have the requester and sender fields, but it's
      // good to have them here for reference.
      user: data.user ? data.user._id : null,
      sender: {
        fullName: data.user ? data.user.fullName : data.fullName,
        avatarUrl: data.user ? data.user?.profileImageUrl : null,
      },
    });

    // if the message was not created, return a 400 error
    if (!message) {
      // the ticket will still be created, but the message will not be attached
      throw new ErrorUtil('Message was not created', 401);
    }
    return await newTicket.save();
  }

  // Retrieve all tickets for a user
  async fetchAll(options: {
    filters: Array<Object>;
    sort: Record<string, 1 | -1>;
    query: Array<Object>;
    page: Number;
    limit: Number;
  }): Promise<{ entries: any[]; metadata: any[] }[]> {
    return await SupportTicket.aggregate([
      {
        $match: {
          $and: [
            ...options.filters, // Apply user filter here
          ],
          ...(options.query.length > 0 && { $or: options.query }), // Only include `$or` if it has conditions
        },
      },
      {
        $sort: {
          ...options.sort,
        },
      },
      {
        $facet: {
          metadata: [
            { $count: 'totalCount' }, // Count the total number of documents
            { $addFields: { page: options.page, limit: options.limit } }, // Add metadata for the page and page size
          ],
          entries: [
            { $skip: (Number(options.page) - 1) * Number(options.limit) },
            { $limit: Number(options.limit) },
            {
              $lookup: {
                from: 'supportgroups',
                localField: 'groups',
                foreignField: '_id',
                as: 'groups',
                pipeline: [
                  {
                    $project: {
                      name: 1,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ]);
  }

  // Retrieve a single ticket by ID
  async getTicket(ticketId: string): Promise<SupportType[]> {
    return await SupportTicket.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(ticketId),
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'requester',
          foreignField: '_id',
          as: 'requester',
          pipeline: [
            {
              $project: {
                _id: 1,
                fullName: 1,
                email: 1,
                phoneNumber: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: 'supportgroups',
          localField: 'groups',
          foreignField: '_id',
          as: 'groups',
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
              },
            },
          ],
        },
      },
      {
        $unwind: { path: '$requester', preserveNullAndEmptyArrays: true },
      },
    ]);
  }

  // Update a ticket (e.g., reply or status change)
  async update(ticketId: string, data: any): Promise<SupportType> {
    const item = await SupportTicket.findById(ticketId);

    if (!item) {
      throw new ErrorUtil('Ticket not found', 404);
    }
    // next we need to find all of our support groups and assign the ticket to the group
    // that matches the category, the Category field is an array of strings, so find
    // all groups that match the category strings
    const groups = await SupportGroup.find({
      name: { $in: data.category },
    });

    // if no groups are found, return a 400 error something went wrong...
    if (!groups.length) {
      throw new ErrorUtil('Ticket Group Not Found', 404);
    }

    //update the ticket with the groups that were found
    item.groups = groups.map((group) => group._id) as any;

    const updatedItem = await SupportTicket.findByIdAndUpdate(
      item._id,
      { ...data },
      {
        returnDocument: 'after',
        runValidators: true,
      }
    );
    if (!updatedItem) {
      throw new ErrorUtil('Ticket was unable to update', 400);
    }
    return await updatedItem.save();
  }

  // Delete a ticket by ID
  async delete(ticketId: string): Promise<{ success: boolean }> {
    // find the object
    const object = await SupportTicket.findById(ticketId);
    // if the object doesn't exist, return an error
    if (!object) {
      throw new ErrorUtil('Ticket not found', 404);
    }

    // find all supportmessages that belong to the ticket, and delete them
    await SupportMessage.deleteMany({ ticket: object._id });

    // delete the object
    await SupportTicket.findByIdAndDelete(ticketId);
    return { success: true };
  }

  // Get messages for a specific ticket
  async getMessages(options: { filters: Array<Object>; sort: Record<string, 1 | -1>; query: Array<Object>; page: Number; limit: Number }): Promise<Array<SupportMessageType>> {
    const { filters, sort, query, page, limit } = options;
    return await SupportMessage.aggregate([
      {
        $match: {
          $and: [...filters],
          ...(query.length > 0 && { $or: query }),
        },
      },
      {
        $sort: sort,
      },
      {
        $facet: {
          metadata: [{ $count: 'totalCount' }, { $addFields: { page, limit } }],
          entries: [
            { $skip: (Number(page) - 1) * Number(limit) },
            { $limit: Number(limit) },
            {
              $lookup: {
                from: 'supportgroups',
                localField: 'groups',
                foreignField: '_id',
                as: 'groups',
                pipeline: [
                  {
                    $project: {
                      name: 1,
                      _id: 1,
                    },
                  },
                ],
              },
            },
            {
              $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'sender',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      fullName: 1,
                      email: 1,
                      profileImageUrl: 1,
                      role: 1,
                    },
                  },
                ],
              },
            },
            {
              $unwind: { path: '$sender', preserveNullAndEmptyArrays: true },
            },
          ],
        },
      },
    ]);
  }

  async createMessage(ticketId: string, data: any): Promise<any> {
    //try to locate ticket
    const ticket = await Support.findById(ticketId);
    //if no ticket is found, return a 400 error
    if (!ticket) {
      throw new ErrorUtil('Ticket not found', 404);
    }
    //create the message
    const newMessage = await SupportMessage.create({
      ticket: ticket._id,
      message: data.message,
      user: data.user ? data.user._id : null,
      sender: {
        email: data.user?.email || data.email || '',
        fullName: data.user?.fullName || data.fullName || '',
      },
    });
    //if the message was not created, return a 400 error
    if (!newMessage) {
      throw new ErrorUtil('Message was not created', 400);
    }

    // find out who is sending the message, is it the agent or the user?
    // if the user is sending the message, we need to update the ticket status to open, and we send a notification to the agent
    // if its the agent, we set the status to pending and send a notification to the user, but not the agent
    // we can see whose sending the message by checking req.user against the ticket user, if they are the same, then its the user sending the message
    // if they are different, then its the agent sending the message
    // ticket.requester can be null, so we need to check if it exists before comparing
    let isUser = true; // default to true, meaning the user is sending the message
    if (!ticket.requester) {
      isUser = false;
    } else {
      isUser = ticket?.requester!.toString() === data.user?._id.toString();
    }

    // update the ticket status
    ticket.status = isUser ? 'open' : 'pending';

    // build a return object that can be used in the event emitter
    const user = data.user || null;
    const returnObject = {
      ticket,
      message: newMessage,
      user: user ? user : null,
      assignee: ticket.assignee ? ticket.assignee : null,
      isUser,
    };

    // save the ticket
    await ticket.save();
    return returnObject;
  }
}
