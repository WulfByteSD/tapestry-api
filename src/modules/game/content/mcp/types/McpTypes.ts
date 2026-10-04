

export const CONTENT_TYPES = ['items', 'skills', 'abilities', 'settings', 'lore', 'combatants'] as const;
export const CAPABILITIES = ['read', 'propose', 'create', 'update', 'bulk', 'publish', 'read:draft', 'read:archived'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export type Capability = (typeof CAPABILITIES)[number];
export const MCP_PATH = '/api/v1/game/content/mcp';
export interface McpConfig {
  resource: string;
  origin: string;
  hosts: string[];
  origins: string[];
}
export interface Actor {
  grantId: string;
  clientId: string;
  ownerId: string;
  capabilities: Capability[];
  contentTypes: ContentType[];
  settingKeys: string[];
  shared: boolean;
  ceiling: Capability[];
}

/** A bounded content mutation using the domain's existing identifiers. */
export interface Operation { type: ContentType; action: 'create' | 'update'; id?: string; revision?: string; data: Record<string, any> }
