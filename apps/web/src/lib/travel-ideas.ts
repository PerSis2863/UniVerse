// UniVerse Travel's Explore page (M202): places to start from, by what you're after. Each opens its
// Wikivoyage guide (the title); `banner` is that guide's own banner photo on Wikimedia Commons.

export const THEMES = ['Cities', 'Beaches', 'Mountains', 'Food', 'Culture', 'Nature'] as const;
export type Theme = (typeof THEMES)[number];

export interface Idea { title: string; country: string; themes: Theme[]; blurb: string; banner?: string }

export const IDEAS: Idea[] = [
  { title: 'Kyoto', country: 'Japan', themes: ['Culture', 'Food'], blurb: 'Temples, gardens and tea houses in Japan’s old capital.', banner: 'Kyoto banner Fushimi Inari Torii.png' },
  { title: 'Lisbon', country: 'Portugal', themes: ['Cities', 'Food'], blurb: 'Hills, trams, river light and custard tarts.', banner: 'Lisbon Wikivoyage Banner.png' },
  { title: 'Paris', country: 'France', themes: ['Cities', 'Culture', 'Food'], blurb: 'Museums, cafés and walks along the Seine.', banner: 'Paris banner.jpg' },
  { title: 'Bali', country: 'Indonesia', themes: ['Beaches', 'Nature', 'Culture'], blurb: 'Rice terraces, temples and surf beaches.', banner: 'Bali banner Rice terraces.jpg' },
  { title: 'Cape Town', country: 'South Africa', themes: ['Cities', 'Nature', 'Beaches'], blurb: 'A city under Table Mountain, between two oceans.', banner: 'CapeTownPanoramaFromTableMountain_banner.jpg' },
  { title: 'Istanbul', country: 'Türkiye', themes: ['Cities', 'Culture', 'Food'], blurb: 'Two continents, bazaars and a skyline of domes.', banner: 'Istanbul Banner.jpg' },
  { title: 'Marrakech', country: 'Morocco', themes: ['Culture', 'Food'], blurb: 'Souks, riads and the square that comes alive at night.', banner: 'Marrakesh banner.jpg' },
  { title: 'Reykjavík', country: 'Iceland', themes: ['Nature', 'Cities'], blurb: 'The way into glaciers, geysers and the northern lights.', banner: 'Reykjavik Wikivoyage banner.jpg' },
  { title: 'Rome', country: 'Italy', themes: ['Culture', 'Food', 'Cities'], blurb: 'Two thousand years of history on every street.', banner: 'Rome banner cropped to dimensions.jpg' },
  { title: 'Bangkok', country: 'Thailand', themes: ['Cities', 'Food', 'Culture'], blurb: 'Street food, river boats and golden temples.', banner: 'Templo Wat Arun, Bangkok, Tailandia, 2013-08-22, DD 30-crop.jpg' },
  { title: 'Sydney', country: 'Australia', themes: ['Cities', 'Beaches'], blurb: 'A harbour city with beaches a bus ride away.', banner: 'Sydney Harbour Banner.jpg' },
  { title: 'Santorini', country: 'Greece', themes: ['Beaches', 'Culture'], blurb: 'White villages on a volcano’s rim above the sea.', banner: 'Santorini banner Panorama coastline.jpg' },
  { title: 'Banff National Park', country: 'Canada', themes: ['Mountains', 'Nature'], blurb: 'Turquoise lakes under the Rockies.', banner: 'Banff National Park (Alberta) banner 2.jpg' },
  { title: 'Dubrovnik', country: 'Croatia', themes: ['Beaches', 'Culture'], blurb: 'A walled old town on the Adriatic.', banner: 'Dubrovnik D81 4076 (37941725314) (cropped).jpg' },
  { title: 'Hanoi', country: 'Vietnam', themes: ['Cities', 'Food'], blurb: 'Lakes, old-quarter lanes and bowls of phở.', banner: 'Hanoi Banner.jpg' },
  { title: 'Prague', country: 'Czechia', themes: ['Cities', 'Culture'], blurb: 'Spires, bridges and a castle above the river.', banner: 'Prague banner.jpg' },
  { title: 'Machu Picchu', country: 'Peru', themes: ['Mountains', 'Culture'], blurb: 'The Inca city in the clouds.', banner: 'MachuPichuSacredValley banner.jpg' },
  { title: 'Maldives', country: 'Maldives', themes: ['Beaches', 'Nature'], blurb: 'Coral islands, clear water and reefs to dive.', banner: 'Maldives banner Small island shoreline with beach.jpg' },
  { title: 'Cappadocia', country: 'Türkiye', themes: ['Nature', 'Culture'], blurb: 'Balloons at dawn over valleys of stone towers.', banner: 'Cappadocia banner Ballooning.jpg' },
  { title: 'Swiss Alps', country: 'Switzerland', themes: ['Mountains', 'Nature'], blurb: 'Peaks, glaciers and trains through the valleys.', banner: 'Alps banner 1.jpg' },
  { title: 'Petra', country: 'Jordan', themes: ['Culture', 'Nature'], blurb: 'A city carved into rose-red cliffs.', banner: 'Petra banner Al-Khazneh.jpg' },
  { title: 'Seoul', country: 'South Korea', themes: ['Cities', 'Food', 'Culture'], blurb: 'Palaces, night markets and neighbourhoods that never sleep.', banner: 'Seoul_cityscape_banner.jpg' },
  { title: 'New York City', country: 'United States', themes: ['Cities', 'Culture', 'Food'], blurb: 'Every food, every museum, a skyline you know.', banner: 'Manhattan Wikivoyage Banner.jpg' },
  { title: 'Jaipur', country: 'India', themes: ['Culture', 'Food'], blurb: 'The Pink City’s palaces, forts and bazaars.' },
];
