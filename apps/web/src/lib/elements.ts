// The 118 elements for Create → Periodic table (M74): symbol, name, standard atomic weight (rounded;
// a whole number in brackets for elements without stable isotopes) and family. Places in the table
// are worked out from the atomic number. Tested in more-tools.test.ts.

export const FAMILIES = {
  a: 'Alkali metal', e: 'Alkaline earth metal', t: 'Transition metal', p: 'Post-transition metal', m: 'Metalloid',
  n: 'Nonmetal', h: 'Halogen', g: 'Noble gas', l: 'Lanthanide', c: 'Actinide', u: 'Not yet known',
} as const;
export type Family = keyof typeof FAMILIES;

const DATA = `H Hydrogen 1.008 n|He Helium 4.0026 g|Li Lithium 6.94 a|Be Beryllium 9.0122 e|B Boron 10.81 m|C Carbon 12.011 n|N Nitrogen 14.007 n|O Oxygen 15.999 n|F Fluorine 18.998 h|Ne Neon 20.180 g|
Na Sodium 22.990 a|Mg Magnesium 24.305 e|Al Aluminium 26.982 p|Si Silicon 28.085 m|P Phosphorus 30.974 n|S Sulfur 32.06 n|Cl Chlorine 35.45 h|Ar Argon 39.95 g|
K Potassium 39.098 a|Ca Calcium 40.078 e|Sc Scandium 44.956 t|Ti Titanium 47.867 t|V Vanadium 50.942 t|Cr Chromium 51.996 t|Mn Manganese 54.938 t|Fe Iron 55.845 t|Co Cobalt 58.933 t|Ni Nickel 58.693 t|Cu Copper 63.546 t|Zn Zinc 65.38 t|Ga Gallium 69.723 p|Ge Germanium 72.630 m|As Arsenic 74.922 m|Se Selenium 78.971 n|Br Bromine 79.904 h|Kr Krypton 83.798 g|
Rb Rubidium 85.468 a|Sr Strontium 87.62 e|Y Yttrium 88.906 t|Zr Zirconium 91.224 t|Nb Niobium 92.906 t|Mo Molybdenum 95.95 t|Tc Technetium [98] t|Ru Ruthenium 101.07 t|Rh Rhodium 102.91 t|Pd Palladium 106.42 t|Ag Silver 107.87 t|Cd Cadmium 112.41 t|In Indium 114.82 p|Sn Tin 118.71 p|Sb Antimony 121.76 m|Te Tellurium 127.60 m|I Iodine 126.90 h|Xe Xenon 131.29 g|
Cs Caesium 132.91 a|Ba Barium 137.33 e|La Lanthanum 138.91 l|Ce Cerium 140.12 l|Pr Praseodymium 140.91 l|Nd Neodymium 144.24 l|Pm Promethium [145] l|Sm Samarium 150.36 l|Eu Europium 151.96 l|Gd Gadolinium 157.25 l|Tb Terbium 158.93 l|Dy Dysprosium 162.50 l|Ho Holmium 164.93 l|Er Erbium 167.26 l|Tm Thulium 168.93 l|Yb Ytterbium 173.05 l|Lu Lutetium 174.97 l|
Hf Hafnium 178.49 t|Ta Tantalum 180.95 t|W Tungsten 183.84 t|Re Rhenium 186.21 t|Os Osmium 190.23 t|Ir Iridium 192.22 t|Pt Platinum 195.08 t|Au Gold 196.97 t|Hg Mercury 200.59 t|Tl Thallium 204.38 p|Pb Lead 207.2 p|Bi Bismuth 208.98 p|Po Polonium [209] p|At Astatine [210] h|Rn Radon [222] g|
Fr Francium [223] a|Ra Radium [226] e|Ac Actinium [227] c|Th Thorium 232.04 c|Pa Protactinium 231.04 c|U Uranium 238.03 c|Np Neptunium [237] c|Pu Plutonium [244] c|Am Americium [243] c|Cm Curium [247] c|Bk Berkelium [247] c|Cf Californium [251] c|Es Einsteinium [252] c|Fm Fermium [257] c|Md Mendelevium [258] c|No Nobelium [259] c|Lr Lawrencium [266] c|
Rf Rutherfordium [267] t|Db Dubnium [268] t|Sg Seaborgium [269] t|Bh Bohrium [270] t|Hs Hassium [277] t|Mt Meitnerium [278] u|Ds Darmstadtium [281] u|Rg Roentgenium [282] u|Cn Copernicium [285] u|Nh Nihonium [286] u|Fl Flerovium [289] u|Mc Moscovium [290] u|Lv Livermorium [293] u|Ts Tennessine [294] u|Og Oganesson [294] u`;

const GASES = new Set(['H', 'He', 'N', 'O', 'F', 'Ne', 'Cl', 'Ar', 'Kr', 'Xe', 'Rn']), LIQUIDS = new Set(['Br', 'Hg']);
const ENDS = [2, 10, 18, 36, 54, 86, 118];

export interface Element { z: number; symbol: string; name: string; mass: string; family: Family; period: number; group: number | null; row: number; col: number; state: string }

export const ELEMENTS: Element[] = DATA.replace(/\n/g, '').split('|').map((e, i) => {
  const [symbol, name, mass, family] = e.trim().split(' ');
  const z = i + 1, period = ENDS.findIndex((x) => z <= x) + 1, pos = z - (ENDS[period - 2] ?? 0) - 1;
  let group: number | null, row = period, col: number;
  if (period === 1) group = z === 1 ? 1 : 18;
  else if (period <= 3) group = pos < 2 ? pos + 1 : pos + 11;
  else if (period <= 5) group = pos + 1;
  else group = pos < 2 ? pos + 1 : pos <= 16 ? null : pos - 13;
  // The f-block (lanthanides, actinides) sits in its own two rows under the table.
  if (group === null) { row = period + 3; col = pos + 1; } else col = group;
  const state = z > 103 ? 'unknown' : GASES.has(symbol) ? 'gas' : LIQUIDS.has(symbol) ? 'liquid' : 'solid';
  return { z, symbol, name, mass, family: family as Family, period, group, row, col, state };
});
