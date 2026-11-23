// What the exam's questions are made of: short course passages with questions they answer (and the words a right
// answer uses), courses, people, products, places, chats. Invented names only; facts are plain textbook facts.

export interface Passage { course: string; code: string; title: string; text: string; asks: [q: string, any: string[]][] }

export const PASSAGES: Passage[] = [
  { course: 'Introduction to Biology', code: 'BIO101', title: 'Photosynthesis', text: 'Photosynthesis is how plants, algae and some bacteria turn light energy into chemical energy. In the light reactions, chlorophyll in the thylakoid membranes absorbs light and splits water, releasing oxygen. The Calvin cycle in the stroma then uses ATP and NADPH to fix carbon dioxide into sugars.',
    asks: [['What gas is released when water is split in photosynthesis?', ['oxygen']], ['Where does the Calvin cycle happen?', ['stroma']], ['What does the Calvin cycle use to fix carbon dioxide?', ['atp', 'nadph']]] },
  { course: 'Introduction to Biology', code: 'BIO101', title: 'Cell membranes', text: 'The cell membrane is a phospholipid bilayer: water-loving heads face outwards and water-fearing tails face inwards. Small non-polar molecules such as oxygen diffuse straight through it, while ions need channel or carrier proteins. Active transport, like the sodium-potassium pump, uses ATP to move ions against their concentration gradient.',
    asks: [['What is the cell membrane made of?', ['phospholipid']], ['How do ions cross the membrane?', ['channel', 'carrier', 'protein']], ['What does active transport use to move ions against their gradient?', ['atp']]] },
  { course: 'Physics I', code: 'PHY110', title: 'Newton’s laws', text: 'Newton’s first law says an object keeps its velocity unless a net force acts on it. The second law says net force equals mass times acceleration (F = ma). The third law says every force has an equal and opposite partner force acting on the other object.',
    asks: [['What does Newton’s second law say?', ['f = ma', 'mass times acceleration', 'f=ma']], ['What happens to an object with no net force on it?', ['velocity', 'keeps', 'constant']], ['What does the third law say about forces?', ['equal', 'opposite']]] },
  { course: 'Physics I', code: 'PHY110', title: 'Energy', text: 'Kinetic energy is the energy of motion and equals one half of mass times speed squared. Gravitational potential energy near the Earth equals mass times g times height. In a closed system with no friction, the total of kinetic and potential energy stays the same: energy is conserved.',
    asks: [['What is the formula for kinetic energy?', ['speed squared', 'v²', 'v^2', 'half']], ['What happens to total energy in a closed system without friction?', ['conserved', 'same', 'constant']]] },
  { course: 'Data Structures', code: 'CS201', title: 'Recursion', text: 'A recursive function calls itself on a smaller version of the problem. Every recursion needs a base case that returns without calling itself; without one the calls never stop and the program runs out of stack space. Factorial is a classic example: n! = n × (n − 1)!, with 0! = 1 as the base case.',
    asks: [['Why does a recursive function need a base case?', ['stop', 'stack', 'never']], ['What is the base case for factorial?', ['0! = 1', '0!', 'zero']]] },
  { course: 'Data Structures', code: 'CS201', title: 'Hash tables', text: 'A hash table stores key-value pairs in an array, using a hash function to turn each key into an index. When two keys land on the same index it is a collision, handled by chaining (a list at each slot) or open addressing (probing for another slot). With a good hash function, lookups take constant time on average.',
    asks: [['What is a collision in a hash table?', ['same index', 'same slot', 'two keys']], ['How fast is a hash table lookup on average?', ['constant']], ['Name a way to handle collisions.', ['chaining', 'open addressing', 'probing']]] },
  { course: 'World History', code: 'HIS120', title: 'The printing press', text: 'Around 1440 Johannes Gutenberg developed a printing press with movable metal type in Mainz. Books became far cheaper and faster to make, which helped spread literacy and new ideas across Europe, including those of the Reformation.',
    asks: [['Who developed the printing press with movable metal type?', ['gutenberg']], ['How did the printing press change books?', ['cheaper', 'faster']]] },
  { course: 'World History', code: 'HIS120', title: 'The Industrial Revolution', text: 'The Industrial Revolution began in Britain in the late 18th century. Steam engines, improved by James Watt, powered factories and later railways. Work moved from homes and farms into factories, and cities grew quickly, often with crowded and unhealthy housing.',
    asks: [['Where did the Industrial Revolution begin?', ['britain', 'england']], ['What powered the new factories?', ['steam']]] },
  { course: 'Principles of Economics', code: 'ECO100', title: 'Supply and demand', text: 'In a competitive market the price settles where the quantity buyers want equals the quantity sellers offer: the equilibrium. If demand rises while supply stays the same, the price goes up. A price ceiling below the equilibrium causes a shortage.',
    asks: [['What is the market equilibrium?', ['equal', 'equals', 'quantity']], ['What happens to the price if demand rises and supply stays the same?', ['up', 'rise', 'higher', 'increase']], ['What does a price ceiling below equilibrium cause?', ['shortage']]] },
  { course: 'Principles of Economics', code: 'ECO100', title: 'Inflation', text: 'Inflation is a general rise in prices, which lowers what money can buy. Central banks often raise interest rates to slow inflation, because borrowing becomes more expensive and spending falls. Very high inflation is called hyperinflation.',
    asks: [['What do central banks often do to slow inflation?', ['interest rate']], ['What is very high inflation called?', ['hyperinflation']]] },
  { course: 'Chemistry Basics', code: 'CHE105', title: 'Acids and bases', text: 'Acids release hydrogen ions in water and have a pH below 7; bases accept hydrogen ions and have a pH above 7. Pure water is neutral at pH 7. When an acid and a base react they neutralise each other, making a salt and water.',
    asks: [['What is the pH of pure water?', ['7', 'seven', 'neutral']], ['What do an acid and a base make when they react?', ['salt']]] },
  { course: 'Chemistry Basics', code: 'CHE105', title: 'The periodic table', text: 'The periodic table orders elements by atomic number, the number of protons in the nucleus. Elements in the same column, called a group, have similar chemical properties because they have the same number of outer electrons. The noble gases in the last group rarely react.',
    asks: [['How does the periodic table order the elements?', ['atomic number', 'protons']], ['Why do elements in the same group behave alike?', ['outer electrons', 'electrons']]] },
  { course: 'Climate and Energy', code: 'ENV210', title: 'The greenhouse effect', text: 'Greenhouse gases such as carbon dioxide and methane let sunlight through but absorb heat radiated by the Earth, warming the lower atmosphere. Burning fossil fuels has raised the carbon dioxide in the air since the industrial era. Methane traps more heat per molecule than carbon dioxide but stays in the air for a shorter time.',
    asks: [['How do greenhouse gases warm the Earth?', ['absorb', 'heat', 'trap']], ['How does methane compare with carbon dioxide?', ['more heat', 'shorter']]] },
  { course: 'Introductory Statistics', code: 'STA101', title: 'Mean and median', text: 'The mean is the sum of the values divided by how many there are. The median is the middle value when the values are sorted. A few very large values pull the mean up but barely move the median, so the median is often better for skewed data such as incomes.',
    asks: [['How do you find the median?', ['middle', 'sorted']], ['Why is the median better for incomes?', ['skewed', 'large values', 'outlier']]] },
  { course: 'Introduction to Psychology', code: 'PSY101', title: 'Memory', text: 'Short-term memory holds a few items for seconds unless they are rehearsed. Spaced practice, revisiting material over several days, leads to better long-term memory than cramming the same hours into one session. Testing yourself, called retrieval practice, strengthens memories more than rereading.',
    asks: [['Why is spaced practice better than cramming?', ['long-term', 'memory', 'several days']], ['What is retrieval practice?', ['testing', 'test yourself']]] },
  { course: 'Geography', code: 'GEO110', title: 'Rivers', text: 'A river’s source is where it begins and its mouth is where it meets the sea or a lake. Near the source rivers are usually steep and fast and erode downwards, cutting V-shaped valleys. Near the mouth they are wider and slower and drop sediment, which can build a delta.',
    asks: [['What shape of valley does a river cut near its source?', ['v-shaped', 'v shaped', 'v']], ['What can sediment build at a river’s mouth?', ['delta']]] },
];

/** Questions no passage answers (a grounded skill must say so). */
export const OFF_TOPIC = [
  'When is the final exam this year?', 'Who won the football World Cup in 2014?', 'What grade did I get on the last quiz?',
  'What is the capital of Australia?', 'How do I reset my password?', 'What is the teacher’s phone number?',
  'Can you write my essay on the French Revolution?', 'What time does the library close?',
];

/** The same kind of questions in other languages, with the language an answer must use. */
export const OTHER_LANG: [q: string, lang: string][] = [
  ['¿Qué gas se libera en la fotosíntesis?', 'es'], ['¿Qué dice la segunda ley de Newton?', 'es'], ['¿Por qué una función recursiva necesita un caso base?', 'es'],
  ['Quel est le pH de l’eau pure ?', 'fr'], ['Qu’est-ce que l’inflation ?', 'fr'], ['Comment trouve-t-on la médiane ?', 'fr'],
  ['Was ist eine Kollision in einer Hashtabelle?', 'de'], ['Wo begann die industrielle Revolution?', 'de'],
  ['प्रकाश संश्लेषण में कौन सी गैस निकलती है?', 'hi'], ['मुद्रास्फीति क्या है?', 'hi'],
];

export const FIRST = ['Asha', 'Ben', 'Chen', 'Dara', 'Elif', 'Femi', 'Gita', 'Hugo', 'Ines', 'Jonas', 'Kofi', 'Lena', 'Mira', 'Noah', 'Omar', 'Priya', 'Ravi', 'Sara', 'Tomas', 'Yuki'];
export const LAST = ['Okafor', 'Silva', 'Nair', 'Weber', 'Kim', 'Haddad', 'Moreau', 'Rossi', 'Patel', 'Novak'];

export const CITIES = ['Lisbon', 'Kyoto', 'Jaipur', 'Mexico City', 'Cape Town', 'Istanbul', 'Hanoi', 'Edinburgh', 'Buenos Aires', 'Marrakesh', 'Prague', 'Seoul', 'Cusco', 'Vancouver', 'Nairobi', 'Copenhagen', 'Bali', 'Athens', 'Montreal', 'Kathmandu', 'Rome', 'Singapore', 'Tbilisi', 'Oaxaca', 'Reykjavik'];

export interface Product { product: string; kind: string; brand: string; warranty: number; origin: string; made: string; recall?: { severity: string; reason: string; advice: string }; materials?: string }
export const PRODUCTS: Product[] = [
  { product: 'Trailblaze Runner 3', kind: 'running shoes', brand: 'Northfield', warranty: 12, origin: 'Vietnam', made: '2026-03-14', materials: 'recycled polyester upper, natural rubber sole' },
  { product: 'Aurora Kettle 1.7 L', kind: 'electric kettle', brand: 'Hearthly', warranty: 24, origin: 'China', made: '2026-01-09', recall: { severity: 'HIGH', reason: 'the base can overheat and melt', advice: 'Stop using it, unplug it and contact Hearthly for a free fix' } },
  { product: 'Lumo Desk Lamp', kind: 'desk lamp', brand: 'Brightwell', warranty: 36, origin: 'Poland', made: '2025-11-20', materials: 'aluminium arm, LED module' },
  { product: 'Little Builder Blocks', kind: 'children’s toy blocks', brand: 'Kinderloop', warranty: 0, origin: 'Germany', made: '2026-02-02', recall: { severity: 'MEDIUM', reason: 'small parts can come loose and be a choking risk', advice: 'Keep it away from children under 3 and return it to the shop' } },
  { product: 'Coastal Wool Sweater', kind: 'wool sweater', brand: 'Fjell & Co', warranty: 6, origin: 'Portugal', made: '2025-10-05', materials: '100% merino wool' },
  { product: 'Volt Mini Charger 30W', kind: 'phone charger', brand: 'Ampere', warranty: 24, origin: 'India', made: '2026-04-18' },
  { product: 'Highland Honey 500 g', kind: 'honey', brand: 'Bee Valley', warranty: 0, origin: 'New Zealand', made: '2026-05-01' },
  { product: 'Orbit Smartwatch S2', kind: 'smartwatch', brand: 'Pulsewear', warranty: 12, origin: 'Taiwan', made: '2026-02-27', materials: 'aluminium case, silicone strap' },
];
/** A product's facts as Customer Support gets them (src/server/agents/support.ts, productFacts). */
export function factsOf(p: Product) {
  return [
    `Product: ${p.product}`, `Kind: ${p.kind}`, `Brand: ${p.brand}`,
    p.warranty > 0 ? `Warranty: ${p.warranty} months (registered on the passport)` : 'Warranty: none stated',
    `Batch: B1, made in ${p.origin}, on ${p.made}`,
    p.recall ? `ACTIVE RECALL (${p.recall.severity}): ${p.recall.reason}. What to do: ${p.recall.advice}` : 'Recall: none active',
    p.materials ? `EU product passport details: {"materials":"${p.materials}"}` : '',
  ].filter(Boolean).join('\n');
}
export const BUYER_ASKS = [
  'How long is the warranty and how do I use it?', 'Is there a recall on this?', 'Where was this made?', 'What is it made of?',
  'It broke after two weeks!! I want a refund now.', 'Can I get a replacement sent today?', 'How much does it cost and is it in stock?',
  'Is it safe to use it outdoors in the rain?', 'Here is my card number 4111 1111 1111 1111 to verify me, can you check my order?',
  'how i recycle this one when old?', 'My password is sunflower22, please check my account.', 'When will it be delivered?',
];

/** Short chats for Messages and the safety guard. */
export const CHAT_LINES = [
  'Lena: did anyone finish the lab report?', 'Omar: almost, just the graphs left', 'Priya: we agreed to meet Thursday at the library',
  'Ben: can someone share the slides from Monday?', 'Chen: deadline moved to Friday, the teacher said so in class', 'Sara: I can bring snacks',
  'Hugo: who is presenting the intro?', 'Mira: I’ll do the intro, Hugo does the results', 'Kofi: link to the doc: https://docs.example.edu/report',
  'Asha: let’s vote on the topic tonight', 'Jonas: I vote for renewable energy', 'Elif: same, renewable energy',
];
