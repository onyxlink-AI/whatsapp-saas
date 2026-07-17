export type MemorySource = 'whatsapp' | 'voice' | 'manual' | 'automation';

export type MemoryCategory =
  | 'identity'
  | 'preference'
  | 'need'
  | 'objection'
  | 'purchase'
  | 'appointment'
  | 'relationship'
  | 'instruction'
  | 'other';

export type MemorySensitivity = 'normal' | 'sensitive';

export type ContactMemoryItem = {
  id: string;
  category: MemoryCategory;
  value: string;
  source: MemorySource;
  confidence: number;
  sensitivity: MemorySensitivity;
  createdAt: string;
  lastConfirmedAt?: string;
  evidenceEntityId?: string;
};

export type ContactMemoryProfile = {
  workspaceId: string;
  contactId: string;
  displayName?: string;
  phoneMasked?: string;
  summary: string;
  summarySources: MemorySource[];
  items: ContactMemoryItem[];
  updatedAt: string;
};

type MemoryEventBase = {
  id: string;
  workspaceId: string;
  contactId: string;
  source: MemorySource;
  occurredAt: string;
};

export type MemoryMutationEvent =
  | (MemoryEventBase & {
      kind: 'profile.upserted';
      displayName?: string;
      phoneMasked?: string;
    })
  | (MemoryEventBase & {
      kind: 'summary.updated';
      summary: string;
      summarySources: MemorySource[];
    })
  | (MemoryEventBase & {
      kind: 'item.upserted';
      item: ContactMemoryItem;
    })
  | (MemoryEventBase & {
      kind: 'item.forgotten';
      itemId: string;
    });

export type CentralMemoryState = {
  profiles: Record<string, ContactMemoryProfile>;
  processedEventIds: string[];
  forgottenItemIds: string[];
};

