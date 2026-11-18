// A setup guide for a new shop in Trace (M310): the steps from joining a brand's network to the first
// points, each done by what the shop has really done (from the server) or, for the counter sign, ticked.

export type ShopFacts = { brands: number; stops: number; sales: number; points: number; signShown: boolean };
export type GuideStep = { id: string; title: string; how: string; href?: string; done: boolean };

export function shopSteps(f: ShopFacts): GuideStep[] {
  return [
    { id: 'join', title: 'Join a brand’s network', how: 'Open the invite link the brand sent you: their products then know your shop.', done: f.brands > 0 },
    { id: 'sign', title: 'Show “Scan to check” at the counter', how: 'Print the counter sign so buyers check what they buy, and tick it here.', href: '/trace/print', done: f.signShown },
    { id: 'stop', title: 'Record a delivery when it arrives', how: 'Scan a box or unit as it comes in: its passport shows it reached your shop.', href: '/t/demo', done: f.stops > 0 },
    { id: 'sale', title: 'Check a unit at your first sale', how: 'Scan the unit you sell and press “Earn points”: the buyer sees it’s genuine, and the sale counts for your shop.', done: f.sales > 0 },
    { id: 'points', title: 'See your points and tier', how: 'Points come with each sale you check; more sales, a higher tier on the brand’s page.', href: '/trace/wallet', done: f.points > 0 },
  ];
}

export const guideProgress = (steps: GuideStep[]) => ({ done: steps.filter((s) => s.done).length, total: steps.length, next: steps.find((s) => !s.done) ?? null });
