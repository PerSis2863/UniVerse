import type { Stage } from './trace';

// M173: Trace across the supply chain (the owner, 13 Nov 2026: "whenever someone scan it the user should
// get the location, time and other related informations… when the driver scan it it will get the limited
// information not the info like price… do this for whole supply chain"). Who scans a unit decides what
// they see and which stops they can record. The server decides the role (src/server/trace-chain.ts);
// this file only says what each role sees, so the page and the server agree.

export const CHAIN_ROLES = ['BRAND', 'WAREHOUSE', 'DRIVER', 'SHOP', 'BUYER'] as const;
export type ChainRole = (typeof CHAIN_ROLES)[number];
/** The roles a brand invites to its team (the brand's own people are BRAND, everyone else a BUYER). */
export const HANDLER_ROLES = ['WAREHOUSE', 'DRIVER', 'SHOP'] as const;
export type HandlerRole = (typeof HANDLER_ROLES)[number];

export const ROLE_LABEL: Record<ChainRole, string> = { BRAND: 'Brand', WAREHOUSE: 'Warehouse', DRIVER: 'Driver', SHOP: 'Shop', BUYER: 'Buyer' };
/** What each role's view is for, in a line. */
export const ROLE_NOTE: Record<ChainRole, string> = {
  BRAND: 'Everything about this unit, and who handled it where.',
  WAREHOUSE: 'Batch, quantity, handling and where it goes next. Prices are hidden.',
  DRIVER: 'What you carry, how to handle it and where it goes. Prices and owners are hidden.',
  SHOP: 'The batch, its price and its trip. Record when it reaches your shop.',
  BUYER: 'Where it was made and where it has been.',
};

export interface Sees {
  /** The product's price. */
  price: boolean;
  /** The batch's label and how many units it holds. */
  batch: boolean;
  /** Keep-below temperature and weight. */
  handling: boolean;
  /** Where the shipment is going. */
  destination: boolean;
  /** Who recorded each stop (names), and the unit's scan count. */
  people: boolean;
}
export const SEES: Record<ChainRole, Sees> = {
  BRAND: { price: true, batch: true, handling: true, destination: true, people: true },
  WAREHOUSE: { price: false, batch: true, handling: true, destination: true, people: false },
  DRIVER: { price: false, batch: false, handling: true, destination: true, people: false },
  SHOP: { price: true, batch: true, handling: true, destination: false, people: false },
  BUYER: { price: true, batch: false, handling: false, destination: false, people: false },
};

/** The stops each role may record from a unit's page, with the words on its button. */
export const ROLE_STOPS: Record<ChainRole, { stage: Stage; label: string }[]> = {
  BRAND: [{ stage: 'MADE', label: 'Made' }, { stage: 'SHIPPED', label: 'Shipped' }],
  WAREHOUSE: [{ stage: 'WAREHOUSE', label: 'Arrived at the warehouse' }, { stage: 'SHIPPED', label: 'Left the warehouse' }],
  DRIVER: [{ stage: 'SHIPPED', label: 'Picked up' }, { stage: 'DISTRIBUTOR', label: 'Handed to the distributor' }, { stage: 'SHOP', label: 'Delivered to the shop' }],
  SHOP: [{ stage: 'SHOP', label: 'Arrived in the shop' }],
  BUYER: [],
};
export const canRecord = (role: ChainRole, stage: string) => ROLE_STOPS[role].some((s) => s.stage === stage);

export interface ChainFull {
  price: number | null; currency: string | null;
  batch: { label: string; quantity: number };
  handling: { maxTempC: number | null; weightKg: number };
  destination: string | null;
  stops: { stage: string; place: string | null; at: string; role: string | null; by: string | null }[];
  scans: number;
}

/** The view a role gets of the full facts: what it may not see is left out, not just hidden. */
export function viewFor(role: ChainRole, full: ChainFull) {
  const s = SEES[role];
  return {
    role, sees: s,
    ...(s.price && full.price !== null && { price: full.price, currency: full.currency }),
    ...(s.batch && { batch: full.batch }),
    ...(s.handling && { handling: full.handling }),
    ...(s.destination && { destination: full.destination }),
    stops: full.stops.map((x) => ({ stage: x.stage, place: x.place, at: x.at, role: x.role, ...(s.people && { by: x.by }) })),
    ...(s.people && { scans: full.scans }),
    canRecord: ROLE_STOPS[role],
  };
}
export type ChainView = ReturnType<typeof viewFor>;
