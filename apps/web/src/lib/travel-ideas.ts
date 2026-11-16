import PLACES from './travel-places.json';

// UniVerse Travel's places (M202, grown in M205): Explore's places to start from and the ones "Find a
// destination" ranks. Each opens its Wikivoyage guide (the title). The country, themes, interests and
// the blurb are ours; the position, the month-by-month climate and the banner photo (Wikimedia Commons)
// come from each guide, read ahead by `npx tsx scripts/gen-travel-data.mts --places` into
// travel-places.json (run it again after adding a place here).

export const THEMES = ['Cities', 'Beaches', 'Mountains', 'Food', 'Culture', 'Nature'] as const;
export type Theme = (typeof THEMES)[number];

/** What a person can be after, for "Find a destination". */
export const INTERESTS = [
  { id: 'food', label: 'Food' }, { id: 'street', label: 'Street food' }, { id: 'history', label: 'History' },
  { id: 'art', label: 'Art and museums' }, { id: 'walk', label: 'Walkable' }, { id: 'night', label: 'Nightlife' },
  { id: 'beach', label: 'Beaches' }, { id: 'nature', label: 'Nature' }, { id: 'hike', label: 'Hiking' },
  { id: 'mount', label: 'Mountains' }, { id: 'wild', label: 'Wildlife' }, { id: 'dive', label: 'Diving and snorkelling' },
  { id: 'shop', label: 'Shopping' }, { id: 'family', label: 'With children' }, { id: 'romance', label: 'Romantic' },
  { id: 'snow', label: 'Snow and skiing' }, { id: 'wine', label: 'Wine' }, { id: 'spirit', label: 'Temples and spirit' },
] as const;
export type Interest = (typeof INTERESTS)[number]['id'];

/** Twelve months, January first: the average high and low (°C) and rain (mm). */
export interface PlaceClimate { high: number[]; low: number[]; rain: number[] }
export interface Idea {
  title: string; country: string; cc: string; themes: Theme[]; tags: Interest[]; blurb: string; banner?: string;
  lat?: number; lon?: number; climate?: PlaceClimate;
}

// [guide title, country code, themes (C cities, B beaches, M mountains, F food, U culture, N nature),
//  interests, blurb, banner (else the guide's own)]. The first 24 are Explore's first cards.
type Row = [string, string, string, string, string, string?];
const ROWS: Row[] = [
  ['Kyoto', 'JP', 'UF', 'history food walk art spirit', 'Temples, gardens and tea houses in Japan’s old capital.', 'Kyoto banner Fushimi Inari Torii.png'],
  ['Lisbon', 'PT', 'CF', 'food history walk night romance', 'Hills, trams, river light and custard tarts.', 'Lisbon Wikivoyage Banner.png'],
  ['Paris', 'FR', 'CUF', 'food art history walk romance shop', 'Museums, cafés and walks along the Seine.', 'Paris banner.jpg'],
  ['Bali', 'ID', 'BNU', 'beach nature spirit dive romance', 'Rice terraces, temples and surf beaches.', 'Bali banner Rice terraces.jpg'],
  ['Cape Town', 'ZA', 'CNB', 'nature beach food wine hike', 'A city under Table Mountain, between two oceans.', 'CapeTownPanoramaFromTableMountain_banner.jpg'],
  ['Istanbul', 'TR', 'CUF', 'history food street shop walk', 'Two continents, bazaars and a skyline of domes.', 'Istanbul Banner.jpg'],
  ['Marrakech', 'MA', 'UF', 'history food street shop', 'Souks, riads and the square that comes alive at night.', 'Marrakesh banner.jpg'],
  ['Reykjavík', 'IS', 'NC', 'nature hike wild', 'The way into glaciers, geysers and the northern lights.', 'Reykjavik Wikivoyage banner.jpg'],
  ['Rome', 'IT', 'UFC', 'history food art walk romance', 'Two thousand years of history on every street.', 'Rome banner cropped to dimensions.jpg'],
  ['Bangkok', 'TH', 'CFU', 'food street history shop night spirit', 'Street food, river boats and golden temples.', 'Templo Wat Arun, Bangkok, Tailandia, 2013-08-22, DD 30-crop.jpg'],
  ['Sydney', 'AU', 'CB', 'beach food walk family', 'A harbour city with beaches a bus ride away.', 'Sydney Harbour Banner.jpg'],
  ['Santorini', 'GR', 'BU', 'beach romance wine', 'White villages on a volcano’s rim above the sea.', 'Santorini banner Panorama coastline.jpg'],
  ['Banff National Park', 'CA', 'MN', 'mount nature hike snow wild', 'Turquoise lakes under the Rockies.', 'Banff National Park (Alberta) banner 2.jpg'],
  ['Dubrovnik', 'HR', 'BU', 'beach history romance walk', 'A walled old town on the Adriatic.', 'Dubrovnik D81 4076 (37941725314) (cropped).jpg'],
  ['Hanoi', 'VN', 'CF', 'food street history walk', 'Lakes, old-quarter lanes and bowls of phở.', 'Hanoi Banner.jpg'],
  ['Prague', 'CZ', 'CU', 'history walk romance night', 'Spires, bridges and a castle above the river.', 'Prague banner.jpg'],
  ['Machu Picchu', 'PE', 'MU', 'history hike mount', 'The Inca city in the clouds.', 'MachuPichuSacredValley banner.jpg'],
  ['Maldives', 'MV', 'BN', 'beach dive romance', 'Coral islands, clear water and reefs to dive.', 'Maldives banner Small island shoreline with beach.jpg'],
  ['Cappadocia', 'TR', 'NU', 'nature romance hike history', 'Balloons at dawn over valleys of stone towers.', 'Cappadocia banner Ballooning.jpg'],
  ['Swiss Alps', 'CH', 'MN', 'mount hike snow nature', 'Peaks, glaciers and trains through the valleys.', 'Alps banner 1.jpg'],
  ['Petra', 'JO', 'UN', 'history hike', 'A city carved into rose-red cliffs.', 'Petra banner Al-Khazneh.jpg'],
  ['Seoul', 'KR', 'CFU', 'food street shop night history', 'Palaces, night markets and neighbourhoods that never sleep.', 'Seoul_cityscape_banner.jpg'],
  ['New York City', 'US', 'CUF', 'food art shop night walk history', 'Every food, every museum, a skyline you know.', 'Manhattan Wikivoyage Banner.jpg'],
  ['Jaipur', 'IN', 'UF', 'history food shop', 'The Pink City’s palaces, forts and bazaars.'],
  // Europe
  ['Porto', 'PT', 'CF', 'food wine history walk romance', 'Port cellars and tiled churches above the Douro.'],
  ['Madeira', 'PT', 'NB', 'nature hike', 'Levada walks along cliffs over the Atlantic.'],
  ['Florence', 'IT', 'UF', 'art history food walk wine romance', 'The Renaissance in one walkable city.'],
  ['Venice', 'IT', 'UC', 'romance history art walk', 'Canals, bridges and not a single car.'],
  ['Naples', 'IT', 'FC', 'food street history', 'The home of pizza, in the shadow of Vesuvius.'],
  ['Amalfi Coast', 'IT', 'BF', 'beach romance hike food', 'Lemon groves and villages stacked above the sea.'],
  ['Sicily', 'IT', 'BFU', 'beach food history', 'Greek temples, street markets and Etna.'],
  ['Barcelona', 'ES', 'CBF', 'food art beach night walk history', 'Gaudí, tapas and a city beach.'],
  ['Madrid', 'ES', 'CUF', 'food art night walk history', 'Great museums and late, long dinners.'],
  ['Seville', 'ES', 'UC', 'history walk romance food', 'Orange trees, flamenco and Moorish palaces.'],
  ['Granada', 'ES', 'UM', 'history walk food mount', 'The Alhambra under the Sierra Nevada.'],
  ['Mallorca', 'ES', 'BN', 'beach hike family nature', 'Coves, mountain villages and long sunny days.'],
  ['Amsterdam', 'NL', 'CU', 'walk art night history', 'Canals, bikes and the Dutch masters.'],
  ['Bruges', 'BE', 'UC', 'history walk romance', 'A medieval town of canals and chocolate.'],
  ['Berlin', 'DE', 'CU', 'history art night food', 'History on every corner and nights that run till morning.'],
  ['Munich', 'DE', 'CF', 'history food family', 'Beer gardens, palaces and the Alps on the horizon.'],
  ['Vienna', 'AT', 'CU', 'art history walk romance', 'Palaces, coffee houses and concert halls.'],
  ['Salzburg', 'AT', 'UM', 'history mount walk romance', 'Mozart’s town between river and mountains.'],
  ['Budapest', 'HU', 'CU', 'history night food walk', 'Thermal baths and grand views across the Danube.'],
  ['Kraków', 'PL', 'CU', 'history walk food', 'A royal old town with lively cellar bars.'],
  ['Copenhagen', 'DK', 'CF', 'food walk family art', 'Bikes, harbour baths and new Nordic cooking.'],
  ['Stockholm', 'SE', 'CU', 'history art walk nature', 'A capital spread over fourteen islands.'],
  ['Tallinn', 'EE', 'UC', 'history walk', 'A medieval old town by the Baltic.'],
  ['London', 'GB', 'CU', 'art history shop night food', 'Free museums, markets and theatres galore.'],
  ['Edinburgh', 'GB', 'UC', 'history walk hike', 'A castle on a volcano and a festival city.'],
  ['Dublin', 'IE', 'CU', 'night history walk', 'Pubs with music and Georgian squares.'],
  ['Nice', 'FR', 'BF', 'beach food romance walk', 'The Riviera’s promenade and an old-town market.'],
  ['Chamonix', 'FR', 'MN', 'mount snow hike', 'Under Mont Blanc, for skiing and high trails.'],
  ['Interlaken', 'CH', 'MN', 'mount hike nature family', 'Between two lakes, beneath the Jungfrau.'],
  ['Zermatt', 'CH', 'MN', 'mount snow hike romance', 'A car-free village facing the Matterhorn.'],
  ['Athens', 'GR', 'UF', 'history food walk', 'The Acropolis above a city of tavernas.'],
  ['Crete', 'GR', 'BFU', 'beach hike history food', 'Gorges, Minoan palaces and long beaches.'],
  ['Split', 'HR', 'BU', 'beach history night', 'A Roman palace that became a town.'],
  ['Plitvice Lakes National Park', 'HR', 'N', 'nature hike family', 'Sixteen lakes joined by waterfalls.'],
  ['Kotor', 'ME', 'UB', 'history beach walk romance', 'Old walls climbing a fjord-like bay.'],
  ['Ljubljana', 'SI', 'CF', 'walk food romance', 'A green little capital by the river.'],
  ['Bled', 'SI', 'NM', 'nature romance hike', 'An island church in an Alpine lake.'],
  ['Malta', 'MT', 'BU', 'history beach dive', 'Knights’ fortresses and clear diving water.'],
  ['Lofoten', 'NO', 'NM', 'nature hike wild', 'Fishing villages under sharp Arctic peaks.'],
  ['Tromsø', 'NO', 'NC', 'nature snow wild', 'Northern lights and whales above the Arctic Circle.'],
  ['Tbilisi', 'GE', 'CF', 'food wine history walk', 'Sulphur baths, wine and balconied old streets.'],
  // Asia
  ['Tokyo', 'JP', 'CF', 'food street shop art night family', 'Neon, quiet shrines and the best food anywhere.'],
  ['Osaka', 'JP', 'CF', 'food street night shop', 'Japan’s kitchen: eat until you drop.'],
  ['Hokkaido', 'JP', 'NM', 'nature snow food hike', 'Powder snow, hot springs and seafood.'],
  ['Busan', 'KR', 'BF', 'beach food street', 'Beaches, fish markets and hillside villages.'],
  ['Chiang Mai', 'TH', 'UF', 'food street history spirit nature hike', 'Temples, night markets and hills around.'],
  ['Phuket', 'TH', 'B', 'beach dive night family', 'Thailand’s big island of beaches.'],
  ['Krabi Province', 'TH', 'BN', 'beach dive nature', 'Limestone cliffs over turquoise bays.'],
  ['Ho Chi Minh City', 'VN', 'CF', 'food street history night shop', 'Motorbikes, markets and coffee on every corner.'],
  ['Hoi An', 'VN', 'UF', 'food history walk beach romance', 'Lantern-lit lanes and a tailor on every street.'],
  ['Ha Long Bay', 'VN', 'NB', 'nature', 'Thousands of limestone islands in a green sea.'],
  ['Luang Prabang', 'LA', 'UN', 'history spirit nature walk', 'Monks at dawn and waterfalls nearby.'],
  ['Siem Reap', 'KH', 'U', 'history spirit food', 'The gateway to the temples of Angkor.'],
  ['Yogyakarta', 'ID', 'UF', 'history spirit food', 'Borobudur, Prambanan and Javanese culture.'],
  ['Singapore', 'SG', 'CF', 'food street family shop walk', 'Hawker centres and gardens of the future.'],
  ['Kuala Lumpur', 'MY', 'CF', 'food street shop', 'Towers, markets and food from three cultures.'],
  ['Penang', 'MY', 'FU', 'food street history walk', 'George Town’s street art and street food.'],
  ['Hong Kong', 'HK', 'CF', 'food street shop hike night', 'A harbour skyline with mountain trails behind.'],
  ['Taipei', 'TW', 'CF', 'food street hike family walk', 'Night markets, tea hills and hot springs.'],
  ['Beijing', 'CN', 'CU', 'history food', 'The Forbidden City and the Great Wall.'],
  ['Shanghai', 'CN', 'CF', 'food shop night history', 'The Bund, old lanes and a futuristic skyline.'],
  ['Delhi', 'IN', 'CUF', 'history food street shop', 'Mughal monuments and the busiest bazaars.'],
  ['Agra', 'IN', 'U', 'history', 'The Taj Mahal and the Red Fort.'],
  ['Mumbai', 'IN', 'CF', 'food street history night', 'Bollywood, sea breezes and street snacks.'],
  ['Goa', 'IN', 'BF', 'beach night food', 'Beaches, Portuguese churches and seafood.'],
  ['Varanasi', 'IN', 'U', 'spirit history', 'Life and ritual on the banks of the Ganges.'],
  ['Kerala', 'IN', 'NF', 'nature food beach', 'Backwaters, tea hills and spice gardens.'],
  ['Rishikesh', 'IN', 'MN', 'spirit hike nature', 'Yoga and rafting where the Ganges leaves the hills.'],
  ['Kathmandu', 'NP', 'UM', 'history spirit hike mount', 'Temples, stupas and the start of Himalayan treks.'],
  ['Pokhara', 'NP', 'MN', 'mount hike nature', 'A lake town facing the Annapurnas.'],
  ['Sri Lanka', 'LK', 'BNU', 'beach nature history wild', 'Tea country, ancient cities and leopards.'],
  ['Dubai', 'AE', 'CB', 'shop family beach', 'Desert, skyscrapers and huge malls.'],
  ['Jerusalem', 'IL', 'U', 'history spirit walk', 'Holy to three faiths, inside old walls.'],
  ['Samarkand', 'UZ', 'U', 'history', 'Blue-tiled squares on the Silk Road.'],
  ['Palawan', 'PH', 'BN', 'beach dive nature', 'Lagoons, limestone and the clearest water.'],
  // Africa
  ['Fes', 'MA', 'U', 'history shop', 'The world’s largest car-free medieval city.'],
  ['Chefchaouen', 'MA', 'UM', 'walk history romance hike', 'A blue town in the Rif mountains.'],
  ['Essaouira', 'MA', 'BF', 'beach walk food', 'A windy, walled port town with fresh fish.'],
  ['Cairo', 'EG', 'CU', 'history food street', 'The pyramids, the Nile and endless bazaars.'],
  ['Luxor', 'EG', 'U', 'history', 'The temples and tombs of ancient Thebes.'],
  ['Kruger National Park', 'ZA', 'N', 'wild nature', 'Safari drives to see the Big Five.'],
  ['Zanzibar', 'TZ', 'BU', 'beach dive history', 'Spice island beaches and Stone Town.'],
  ['Serengeti National Park', 'TZ', 'N', 'wild nature', 'The great migration across endless plains.'],
  ['Maasai Mara National Reserve', 'KE', 'N', 'wild nature', 'Lions, wildebeest and Maasai villages.'],
  ['Victoria Falls', 'ZW', 'N', 'nature hike', 'The smoke that thunders, on the Zambezi.'],
  ['Mauritius', 'MU', 'BN', 'beach dive romance family', 'Lagoons, sugar fields and mountains.'],
  ['Seychelles', 'SC', 'BN', 'beach dive romance nature', 'Granite boulders on perfect beaches.'],
  // The Americas
  ['San Francisco', 'US', 'CF', 'food walk hike art', 'Hills, fog, cable cars and the Golden Gate.'],
  ['Los Angeles', 'US', 'CB', 'beach family shop art', 'Beaches, studios and canyon hikes.'],
  ['New Orleans', 'US', 'CF', 'food night history', 'Jazz, Creole food and Mardi Gras.'],
  ['Chicago', 'US', 'CF', 'food art walk', 'Architecture, lakefront and deep-dish pizza.'],
  ['Miami', 'US', 'BC', 'beach night food', 'Art Deco, Cuban coffee and warm sea.'],
  ['Maui', 'US', 'BN', 'beach nature dive hike romance', 'Volcano sunrises and the road to Hāna.'],
  ['Grand Canyon National Park', 'US', 'N', 'nature hike', 'A mile deep and two billion years old.'],
  ['Yosemite National Park', 'US', 'MN', 'nature hike mount', 'Granite cliffs, waterfalls and giant trees.'],
  ['Vancouver', 'CA', 'CN', 'nature food hike walk', 'Mountains, sea and a forest in the city.'],
  ['Montreal', 'CA', 'CF', 'food art history walk', 'French, festive and full of bagels.'],
  ['Quebec City', 'CA', 'UC', 'history walk romance snow', 'A walled old town above the St. Lawrence.'],
  ['Mexico City', 'MX', 'CF', 'food street art history', 'Tacos, murals and Aztec ruins.'],
  ['Oaxaca (city)', 'MX', 'UF', 'food street history', 'Mole, mezcal and colourful markets.'],
  ['Cancún', 'MX', 'B', 'beach dive night family', 'Caribbean beaches and Mayan ruins nearby.'],
  ['Tulum', 'MX', 'BU', 'beach history dive', 'Ruins on a cliff above the Caribbean.'],
  ['Havana', 'CU', 'CU', 'history night walk', 'Old cars, music and crumbling grandeur.'],
  ['Cartagena (Colombia)', 'CO', 'UB', 'history beach romance walk', 'A colourful walled city on the Caribbean.'],
  ['Medellín', 'CO', 'C', 'night food', 'The city of eternal spring.'],
  ['Cusco', 'PE', 'UM', 'history hike mount', 'The Inca capital, high in the Andes.'],
  ['Lima', 'PE', 'CF', 'food street history', 'Ceviche, clifftop parks and great restaurants.'],
  ['Buenos Aires', 'AR', 'CF', 'food night art walk', 'Steak, tango and grand avenues.'],
  ['Torres del Paine National Park', 'CL', 'MN', 'hike mount nature', 'Granite towers at the end of the world.'],
  ['Rio de Janeiro', 'BR', 'CB', 'beach night hike', 'Beaches, samba and Sugarloaf Mountain.'],
  ['Galápagos Islands', 'EC', 'N', 'wild dive nature', 'Animals with no fear of people.'],
  ['Costa Rica', 'CR', 'NB', 'nature wild beach hike', 'Rainforests, volcanoes and two coasts.'],
  ['Antigua Guatemala', 'GT', 'UM', 'history walk hike', 'Cobbled streets between three volcanoes.'],
  ['San Juan (Puerto Rico)', 'PR', 'BU', 'beach history night', 'Old San Juan’s forts and the beaches beside them.'],
  // Oceania
  ['Melbourne', 'AU', 'CF', 'food art walk', 'Laneway cafés, galleries and sport.'],
  ['Great Barrier Reef', 'AU', 'NB', 'dive nature wild', 'The world’s largest coral reef.'],
  ['Tasmania', 'AU', 'NF', 'nature hike wild food', 'Wilderness, wildlife and fine food.'],
  ['Queenstown (New Zealand)', 'NZ', 'MN', 'hike mount snow nature', 'Adventure capital on a mountain lake.'],
  ['Auckland', 'NZ', 'CB', 'nature beach walk', 'A city of volcanoes and harbours.'],
  ['Fiji', 'FJ', 'BN', 'beach dive romance family', 'Islands, reefs and a warm welcome.'],
  ['Bora Bora', 'PF', 'B', 'beach romance dive', 'A lagoon of every blue under a green peak.'],
];

const THEME_OF: Record<string, Theme> = { C: 'Cities', B: 'Beaches', M: 'Mountains', F: 'Food', U: 'Culture', N: 'Nature' };
const REGION = typeof Intl !== 'undefined' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const READ = PLACES as unknown as Record<string, { lat?: number; lon?: number; banner?: string; climate?: PlaceClimate }>;

export const IDEAS: Idea[] = ROWS.map(([title, cc, themes, tags, blurb, banner]) => {
  const read = READ[title] ?? {};
  return {
    title, cc, country: cc === 'TR' ? 'Türkiye' : REGION?.of(cc) ?? cc, themes: [...themes].map((t) => THEME_OF[t]), tags: tags.split(' ') as Interest[], blurb,
    banner: banner ?? read.banner, lat: read.lat, lon: read.lon, climate: read.climate,
  };
});
