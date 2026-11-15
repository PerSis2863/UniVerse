import { describe, expect, it } from 'vitest';
import { DIETS, goodMonths, mergeTips, priceBand, readClimate, readTips, sentences, vibes } from './travel-tips';

// M204: "know before you go" picked from a guide's own words by topic, and its climate table.
const WIKI = `Sample Town is a made-up town for this test.
==Understand==
Sample Town was founded in the 12th century by fishermen. It is a quiet place.
{{climate chart|Sample Town|2|10|50|3|11|40|5|14|40|8|18|45|12|22|50|15|26|30|17|29|20|17|28|25|14|24|60|10|19|90|6|14|80|3|11|70|float=right}}
==Get in==
The airport is 20 km away and the express train takes 25 minutes to the centre. Citizens of most countries need no visa for 90 days.
==Get around==
Buy a Sample Card at any station: it covers buses and trams.
==Eat==
The local speciality is grilled sardines with bread. Several stalls at the night market sell vegan wraps.
{{eat|name=Café Uno|content=Cheap and halal.}}
==Stay safe==
Watch out for pickpockets on the crowded tram. The harbour is best avoided late at night.
==Stay healthy==
Tap water is safe to drink everywhere in town.
==Respect==
It is polite to greet shopkeepers when you enter. Cover your shoulders when visiting churches.
`;

describe('know before you go, from a guide', () => {
  it('picks a sentence or two per topic', () => {
    const { tips, climate } = readTips(WIKI);
    expect(tips.water).toEqual(['Tap water is safe to drink everywhere in town.']);
    expect(tips.scams?.[0]).toMatch(/pickpockets/);
    expect(tips.airport?.[0]).toMatch(/express train/);
    expect(tips.visa?.[0]).toMatch(/visa/);
    expect(tips.transit?.[0]).toMatch(/Sample Card/);
    expect(tips.dishes?.[0]).toMatch(/speciality/);
    expect(tips.night?.[0]).toMatch(/late at night/);
    expect(tips.dress?.[0]).toMatch(/Cover your shoulders/);
    expect(tips.stories?.[0]).toMatch(/founded/);
    expect(tips.tipping).toBeUndefined(); // the town says nothing about it
    expect(climate?.high[6]).toBe(29);
    expect(climate && goodMonths(climate)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });
  it('fills what the city lacks from its country, never its stories', () => {
    const { tips, fromCountry } = mergeTips({ water: ['City water.'] }, { water: ['Country water.'], tipping: ['Round up.'], stories: ['Country story.'] });
    expect(tips).toEqual({ water: ['City water.'], tipping: ['Round up.'] });
    expect(fromCountry).toEqual(['tipping']);
  });
  it('reads Fahrenheit tables, sentences and words for food and districts', () => {
    expect(readClimate('{{climate|units=Imperial|jan high=50|jan low=32|feb high=50|feb low=32|mar high=50|mar low=32|apr high=50|apr low=32|may high=50|may low=32|jun high=50|jun low=32|jul high=50|jul low=32|aug high=50|aug low=32|sep high=50|sep low=32|oct high=50|oct low=32|nov high=50|nov low=32|dec high=50|dec low=32|jan precip=1}}')?.high[0]).toBe(10);
    expect(sentences('Climb Mt. Fuji early. Then rest.')).toEqual(['Climb Mt. Fuji early.', 'Then rest.']);
    expect(DIETS.filter((d) => d.says.test('Vegan wraps at the night market')).map((d) => d.id)).toEqual(['vegan', 'street']);
    expect([priceBand('Budget'), priceBand('Mid-range'), priceBand('Splurge'), priceBand('Old town')]).toEqual(['budget', 'mid', 'splurge', null]);
    expect(vibes('Lively bars and clubs near the university, by the harbour')).toEqual(['Nightlife', 'Students', 'Waterfront']);
  });
});
