import { describe, expect, it } from 'vitest';
import { readVisas } from './travel-visa';

// M205: Wikipedia's "Visa requirements for … citizens" table, read row by row.
const WIKI = `{| class="sortable wikitable"
|-
| {{flag|Albania}}
| {{yes|Visa not required}}<ref>{{Timatic|nationality=GB|destination=AL}}</ref>
| 90 days
|
|-
| {{flag|India}}
| data-sort-value="3" {{yes2|eVisa}}<ref>{{Timatic|nationality=GB|destination=IN}}</ref>
| 30 days
| style="background:#FFC7C7;|
* 30 days, 1 year and 5 years of eTourist visa.
|-
| {{flag|Canada}}
| {{yes2|eTA}}<ref>{{Timatic|nationality=GB|destination=CA}}</ref>
| 6 months
|-
| {{flag|Cambodia}}
| {{Optional|eVisa / Visa on arrival}}<ref>{{Timatic|nationality=GB|destination=KH}}</ref>
| 30 days
|-
| {{flag|Maldives}}
| {{yes-no|Visa on arrival}}
| 30 days
|-
| {{flag|Russia}}
| {{no|Visa required}}<ref>{{Timatic|nationality=GB|destination=RU}}</ref>
|
|-
| colspan=2 | {{flag|Hong Kong}}
| data-sort-value="3" {{yes2|Electronic Travel Authorization}}
|
* 14 days
|-
| {{flag|British Indian Ocean Territory}}
| {{no2|Special permit required}}
|}`;

describe('readVisas', () => {
  const v = readVisas(WIKI);
  it('reads each status and stay', () => {
    expect(v.AL).toEqual({ s: 'none', d: '90 days' });
    expect(v.IN).toEqual({ s: 'evisa', d: '30 days' });
    expect(v.CA).toEqual({ s: 'eta', d: '6 months' });
    expect(v.KH).toEqual({ s: 'evisa', d: '30 days' });
    expect(v.RU).toEqual({ s: 'required' });
  });
  it('finds a country by its name when the row has no code', () => {
    expect(v.MV).toEqual({ s: 'arrival', d: '30 days' });
    expect(v.HK).toEqual({ s: 'eta', d: '14 days' });
    expect(v.IO).toEqual({ s: 'permit' });
  });
});
