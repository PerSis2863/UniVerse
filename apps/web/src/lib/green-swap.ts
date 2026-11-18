// The swap and repair board (M320): what a post can be and what it's about.
export const SWAP_KINDS = { GIVE: 'Giving away', SWAP: 'To swap', LEND: 'To lend', WANT: 'Looking for', REPAIR_OFFER: 'I can repair', REPAIR_NEED: 'Needs repairing' } as const;
export type SwapKind = keyof typeof SWAP_KINDS;
export const SWAP_CATEGORIES = { clothes: 'Clothes', books: 'Books', electronics: 'Electronics', furniture: 'Furniture', bikes: 'Bikes', kids: 'Kids', kitchen: 'Kitchen', tools: 'Tools', other: 'Other' } as const;
export type SwapCategory = keyof typeof SWAP_CATEGORIES;
export const SWAP_DAYS = 30;
export const HIDE_AT_REPORTS = 3;
