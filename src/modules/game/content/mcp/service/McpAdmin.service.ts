import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { McpAdminHandler } from '../handlers/McpAdmin.handler';
import { audit } from '../handlers/McpAudit.handler';
import { McpAdminRequest } from '../middleware/McpAuth.middleware';
import { clientCreateSchema, clientUpdateSchema, grantCreateSchema, grantUpdateSchema, operationOnlySchema, paginationSchema, reviewSchema } from '../util/adminContracts';
import { failure } from '../util/McpError';

/** Human administration controllers validate DTOs before calling explicit client, grant, and proposal handlers. */
export class McpAdminService {
  constructor(private handler: McpAdminHandler) {}

  /** Register a client; the response contains a confidential secret only on first successful creation. */
  createClient = this.controller(async req => {
    const { operationId, ...data } = clientCreateSchema.parse(req.body);
    return this.handler.createClient(req.mcpAdmin!.id, operationId, data);
  });
  /** Update a registered client's permitted callbacks or active state. */
  updateClient = this.controller(async req => {
    const { operationId, ...data } = clientUpdateSchema.parse(req.body);
    return this.handler.updateClient(req.mcpAdmin!.id, operationId, this.clientId(req), data);
  });
  /** Rotate a confidential client secret and revoke all older tokens. */
  rotateSecret = this.controller(async req => this.handler.rotateSecret(req.mcpAdmin!.id, operationOnlySchema.parse(req.body).operationId, this.clientId(req)));
  /** Create a separately approved grant for a machine client or interactive account connection. */
  createGrant = this.controller(async req => {
    const { operationId, ...data } = grantCreateSchema.parse(req.body);
    return this.handler.createGrant(req.mcpAdmin!.id, operationId, data);
  });
  /** Change explicit grant bounds without exposing generic persistence operations. */
  updateGrant = this.controller(async req => {
    const { operationId, ...data } = grantUpdateSchema.parse(req.body);
    return this.handler.updateGrant(req.mcpAdmin!.id, operationId, this.id(req.params.id), data);
  });
  /** Revoke a grant immediately; pending proposals cannot subsequently be approved from that grant. */
  revokeGrant = this.controller(async req => this.handler.updateGrant(req.mcpAdmin!.id, operationOnlySchema.parse(req.body).operationId, this.id(req.params.id), { isActive: false }));
  /** Approve the immutable proposal payload through the validated transactional content path. */
  approve = this.review('approve');
  /** Reject a pending proposal without changing content. */
  reject = this.review('reject');
  /** Fetch a complete proposal for human review. */
  getProposal = this.controller(async req => this.handler.getProposal(this.id(req.params.id)));

  /** Return a bounded page of administrative metadata or audit records. */
  list(kind: 'clients' | 'grants' | 'proposals' | 'audit') {
    return this.controller(async req => { const query = paginationSchema.parse(req.query); return this.handler.list(kind, query.page, query.limit, query.state); });
  }

  /** Bind the review decision in the route, rather than accepting an agent-controlled action name. */
  private review(decision: 'approve' | 'reject') {
    return this.controller(async req => { const { operationId, note } = reviewSchema.parse(req.body); return this.handler.review(req.mcpAdmin!.id, operationId, this.id(req.params.id), decision, note); });
  }
  /** Validate path IDs before any database cast is attempted. */
  private id(value: string) { return z.string().regex(/^[a-fA-F0-9]{24}$/).parse(value); }
  /** Client IDs are external identifiers, not MongoDB document IDs. */
  private clientId(req: Request) { return z.string().min(1).max(128).parse(req.params.clientId); }
  /** Keep response/error handling and human administration auditing consistent across all controllers. */
  private controller(work: (req: McpAdminRequest) => Promise<any>) {
    return async (req: McpAdminRequest, res: Response, next: NextFunction) => {
      try {
        await audit(`admin:${req.mcpAdmin!.id}`, 'admin_request');
        res.json({ success: true, payload: await work(req) });
      } catch (error) {
        try { await audit(`admin:${req.mcpAdmin?.id}`, 'admin_denied', { code: failure(error).code }); next(error); }
        catch (storageError) { next(storageError); }
      }
    };
  }
}
