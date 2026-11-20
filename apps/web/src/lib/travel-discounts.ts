// M367 (the owner, 20 Nov: "add more features related to prices where it should show details… if you are student you
// get a discount or an old age so you get discount if it exist in real life and also do this things in other sectors
// like food or visit or shopping"): real, long-running ways to pay less, by country and kind (getting around, sights,
// food, shopping) and by who qualifies. Only well-known schemes, worded as they're usually offered (ages and amounts
// change: each links its official page, and the screen says to check it before buying). Pure and tested.

export type Who = 'student' | 'youth' | 'senior' | 'child' | 'family' | 'disabled' | 'everyone';
export type Sector = 'transport' | 'sights' | 'food' | 'shopping';
export interface Discount { id: string; where: string[]; sector: Sector; who: Who[]; title: string; text: string; url?: string }

export const WHO: { id: Exclude<Who, 'everyone'>; label: string }[] = [
  { id: 'student', label: 'Student' }, { id: 'youth', label: 'Under 26' }, { id: 'senior', label: '60 or over' },
  { id: 'child', label: 'With children' }, { id: 'family', label: 'Family or group' }, { id: 'disabled', label: 'Disabled' },
];
export const SECTORS: { id: Sector; label: string }[] = [
  { id: 'transport', label: 'Getting around' }, { id: 'sights', label: 'Sights' }, { id: 'food', label: 'Food' }, { id: 'shopping', label: 'Shopping' },
];

const EU = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ');
/** Where Interrail passes work (Europeans; Eurail is the same pass for everyone else). */
const RAIL_EUROPE = [...EU, 'GB', 'CH', 'NO', 'TR', 'RS', 'BA', 'ME', 'MK'];

export const DISCOUNTS: Discount[] = [
  // ——— Getting around ———
  { id: 'isic', where: ['*'], sector: 'transport', who: ['student'], title: 'ISIC student card', text: 'The International Student Identity Card is accepted for student prices on buses, trains, sights and in shops in many countries. Bring it with your own student ID.', url: 'https://www.isic.org/' },
  { id: 'interrail', where: RAIL_EUROPE, sector: 'transport', who: ['youth', 'senior', 'child'], title: 'Interrail / Eurail passes', text: 'One pass for trains across Europe. Youth passes (12–27) and Senior passes (60+) cost less than Adult ones, and children under 12 usually travel free with an adult. Fast and night trains may add a seat booking.', url: 'https://www.interrail.eu/' },
  { id: 'gb-1625', where: ['GB'], sector: 'transport', who: ['youth', 'student'], title: '16–25 Railcard', text: 'About a third off most rail fares in Great Britain for 16–25s (and full-time students of any age). It pays for itself in one or two longer trips.', url: 'https://www.railcard.co.uk/' },
  { id: 'gb-senior', where: ['GB'], sector: 'transport', who: ['senior'], title: 'Senior Railcard', text: 'About a third off most rail fares in Great Britain for people aged 60 and over.', url: 'https://www.railcard.co.uk/' },
  { id: 'gb-family', where: ['GB'], sector: 'transport', who: ['family', 'child'], title: 'Family & Friends and Two Together Railcards', text: 'Family & Friends: about a third off for adults and more off for children travelling with them. Two Together: about a third off for two named adults travelling together. Children 5–15 pay about half; under-5s ride free.', url: 'https://www.railcard.co.uk/' },
  { id: 'gb-disabled', where: ['GB'], sector: 'transport', who: ['disabled'], title: 'Disabled Persons Railcard', text: 'About a third off for the cardholder and one adult travelling with them.', url: 'https://www.disabledpersons-railcard.co.uk/' },
  { id: 'fr-sncf', where: ['FR'], sector: 'transport', who: ['youth', 'senior', 'student'], title: 'SNCF Avantage cards', text: 'Carte Avantage Jeune (12–27) and Carte Avantage Senior (60+) give up to about 30% off TGV INOUI and Intercités trains in France for a year.', url: 'https://www.sncf-connect.com/' },
  { id: 'de-bahncard', where: ['DE'], sector: 'transport', who: ['youth', 'senior', 'everyone'], title: 'BahnCard 25 / 50', text: '25% or 50% off Deutsche Bahn fares for a year; cheaper versions for under-27s and over-65s. Worth it from a few long trips.', url: 'https://www.bahn.com/' },
  { id: 'de-kids', where: ['DE'], sector: 'transport', who: ['child', 'family'], title: 'Children free on Deutsche Bahn', text: 'Children under 15 travel free with a parent or grandparent when they are listed on the ticket; under-6s always ride free.', url: 'https://www.bahn.com/' },
  { id: 'es-dorada', where: ['ES'], sector: 'transport', who: ['senior', 'disabled'], title: 'Renfe Tarjeta Dorada', text: 'For people 60 and over (and some disabled travellers): about 25–40% off Renfe trains for a small yearly fee.', url: 'https://www.renfe.com/' },
  { id: 'ch-half', where: ['CH'], sector: 'transport', who: ['everyone', 'youth', 'child', 'family'], title: 'Swiss Half Fare Card and Swiss Travel Pass', text: 'The Half Fare Card halves trains, buses, boats and most mountain railways. Travel passes cost less for under-25s, and children under 16 ride free with a parent holding the Swiss Family Card.', url: 'https://www.sbb.ch/' },
  { id: 'it-kids', where: ['IT'], sector: 'transport', who: ['child', 'family'], title: 'Children on Trenitalia', text: 'Children under 4 travel free without their own seat, and children up to 14 pay a reduced fare.', url: 'https://www.trenitalia.com/' },
  { id: 'us-amtrak', where: ['US'], sector: 'transport', who: ['senior', 'student', 'child'], title: 'Amtrak discounts', text: 'Seniors 65+ about 10% off, students 17–25 about 15% off, children 2–12 about half price on most Amtrak trains.', url: 'https://www.amtrak.com/' },
  { id: 'jp-kids', where: ['JP'], sector: 'transport', who: ['child', 'family'], title: 'Children on Japan’s trains', text: 'Children 6–11 pay about half on JR and most railways; under-6s ride free (usually up to two per adult).', url: 'https://www.japanrailpass.net/' },
  { id: 'in-kids', where: ['IN'], sector: 'transport', who: ['child', 'senior'], title: 'Indian Railways', text: 'Children 5–11 can travel at about half fare without their own berth. The old discount for senior citizens was stopped in 2020.', url: 'https://www.irctc.co.in/' },
  { id: 'book-ahead', where: ['*'], sector: 'transport', who: ['everyone'], title: 'Book trains and coaches early', text: 'Long-distance trains and coaches are usually cheapest weeks ahead and on weekdays; flexible tickets cost more. The links on each way between cities show today’s real fares.' },

  // ——— Sights ———
  { id: 'sights-id', where: ['*'], sector: 'sights', who: ['student', 'senior', 'child', 'disabled'], title: 'Ask for the reduced ticket', text: 'Most museums and sights have lower prices for students, children, over-65s and disabled visitors (often with a companion free). Show ID at the desk.' },
  { id: 'fr-museums', where: ['FR'], sector: 'sights', who: ['child', 'youth'], title: 'France’s national museums', text: 'Free for everyone under 18, and for EU and EEA residents aged 18–25, at the Louvre, Orsay and other national museums and monuments.', url: 'https://www.culture.gouv.fr/' },
  { id: 'it-museums', where: ['IT'], sector: 'sights', who: ['child', 'youth', 'everyone'], title: 'Italy’s state museums', text: 'Free for under-18s and reduced for EU citizens 18–25. On the first Sunday of each month entry is free for everyone (book ahead where you can).', url: 'https://cultura.gov.it/' },
  { id: 'gb-museums', where: ['GB'], sector: 'sights', who: ['everyone'], title: 'National museums are free', text: 'The British Museum, National Gallery, Natural History Museum, V&A, Tate and many others are free to enter; special exhibitions charge.' },
  { id: 'es-prado', where: ['ES'], sector: 'sights', who: ['student', 'senior', 'child', 'everyone'], title: 'The Prado and Madrid’s big museums', text: 'Free for under-18s and for students 18–25 with ID, reduced for over-65s, and free for everyone in the last hours of most days.', url: 'https://www.museodelprado.es/' },
  { id: 'us-smithsonian', where: ['US'], sector: 'sights', who: ['everyone'], title: 'Smithsonian museums are free', text: 'All the Smithsonian museums in Washington, D.C. are free to enter.', url: 'https://www.si.edu/' },
  { id: 'us-parks', where: ['US'], sector: 'sights', who: ['senior', 'disabled'], title: 'US national parks passes', text: 'US citizens and residents aged 62+ can buy a Senior Pass for life; the Access Pass is free for those with a permanent disability. Both cover entry for a carload.', url: 'https://www.nps.gov/planyourvisit/passes.htm' },
  { id: 'city-pass', where: ['*'], sector: 'sights', who: ['everyone', 'family'], title: 'City passes', text: 'Many cities sell a 1–3 day pass with museums and public transport. It saves money only if you’ll see several paid sights a day: add up the tickets first.' },

  // ——— Food ———
  { id: 'fr-crous', where: ['FR'], sector: 'food', who: ['student'], title: 'University restaurants (CROUS)', text: 'Students eat a full meal at university restaurants for a few euros (about €1 for scholarship students).', url: 'https://www.crous.fr/' },
  { id: 'de-mensa', where: ['DE', 'AT', 'CH'], sector: 'food', who: ['student'], title: 'University canteens (Mensa)', text: 'Student prices at university canteens are far below restaurants; guests can often eat too at a higher price.' },
  { id: 'lunch-menu', where: ['ES', 'FR', 'IT', 'PT', 'BE'], sector: 'food', who: ['everyone'], title: 'The set lunch', text: 'Weekday set lunches (menú del día, formule du midi, menu del giorno) give two or three courses for much less than the same dishes at dinner.' },
  { id: 'student-apps', where: ['GB', 'US', 'IE', 'AU', 'CA', 'NZ'], sector: 'food', who: ['student'], title: 'Student discount apps', text: 'UNiDAYS and Student Beans list student discounts at food chains, cafés and shops; many chains ask for them at the till.', url: 'https://www.myunidays.com/' },
  { id: 'kids-eat', where: ['GB', 'US', 'CA', 'AU'], sector: 'food', who: ['child', 'family', 'senior'], title: 'Kids eat free and early-bird menus', text: 'Many family restaurants have nights when children eat free with a paying adult, and some give early-evening or seniors’ prices: ask before you order.' },

  // ——— Shopping ———
  { id: 'eu-vat', where: EU, sector: 'shopping', who: ['everyone'], title: 'Tax-free shopping for visitors', text: 'If you live outside the EU you can claim the VAT back on goods you take home: ask the shop for a tax-free form (each country sets a minimum per receipt, about €100 in France; Spain has none) and have it stamped at customs when you leave.' },
  { id: 'gb-vat', where: ['GB'], sector: 'shopping', who: ['everyone'], title: 'No tax-free shopping in Great Britain', text: 'Since 2021 visitors can no longer claim VAT back on shopping in Great Britain; prices on tags already include it.' },
  { id: 'us-tax', where: ['US', 'CA'], sector: 'shopping', who: ['everyone'], title: 'Tax is added at the till', text: 'Prices on tags don’t include sales tax: it’s added when you pay and depends on the state or province.' },
  { id: 'student-tech', where: ['*'], sector: 'shopping', who: ['student'], title: 'Student prices on laptops and software', text: 'Apple, Microsoft and many others sell to students at education prices; check the brand’s education store with your student email.' },
];

/** The ways to pay less in these countries (and everywhere), for these people (none: all), in this kind (none: all):
 *  country-specific first. */
export function discountsFor(countries: (string | null | undefined)[], who: Who[] = [], sector?: Sector): Discount[] {
  const cc = new Set(countries.filter((c): c is string => !!c));
  return DISCOUNTS.filter((d) => (d.where.includes('*') || d.where.some((w) => cc.has(w)))
    && (!sector || d.sector === sector)
    && (!who.length || d.who.includes('everyone') || d.who.some((w) => who.includes(w))))
    .sort((a, b) => Number(a.where.includes('*')) - Number(b.where.includes('*')));
}
