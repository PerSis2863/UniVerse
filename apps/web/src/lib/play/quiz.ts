import { hash, seeded, shuffled } from '../seeded-shuffle';

// Quiz Clash (UniVerse Play, the UniVersity game): 110 questions from a fixed bank mixed with maths
// made up on the spot, the same sequence for everyone with the same seed. Quick answers and streaks
// score more (quizPoints); three power-ups once a round; the last 15 seconds count double.

export interface QuizQuestion { q: string; options: string[]; answer: number; topic: string }

/** [question, right answer, three wrong answers, topic]. */
const BANK: [string, string, string, string, string, string][] = [
  ['What gas do plants take in to make food?', 'Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium', 'Science'],
  ['How many bones are in an adult human body?', '206', '186', '226', '306', 'Science'],
  ['What is H₂O better known as?', 'Water', 'Salt', 'Hydrogen', 'Ozone', 'Science'],
  ['Which planet is known as the Red Planet?', 'Mars', 'Venus', 'Jupiter', 'Mercury', 'Science'],
  ['What is the hardest natural substance?', 'Diamond', 'Gold', 'Iron', 'Quartz', 'Science'],
  ['Which organ pumps blood around the body?', 'Heart', 'Liver', 'Lungs', 'Kidney', 'Science'],
  ['At what temperature does water boil at sea level?', '100 °C', '90 °C', '120 °C', '80 °C', 'Science'],
  ['What force keeps us on the ground?', 'Gravity', 'Magnetism', 'Friction', 'Inertia', 'Science'],
  ['Which particle has a negative charge?', 'Electron', 'Proton', 'Neutron', 'Photon', 'Science'],
  ['What is the closest star to Earth?', 'The Sun', 'Sirius', 'Polaris', 'Proxima Centauri', 'Science'],
  ['What do bees make?', 'Honey', 'Silk', 'Wax only', 'Milk', 'Science'],
  ['Which blood cells fight infection?', 'White blood cells', 'Red blood cells', 'Platelets', 'Plasma', 'Science'],
  ['What is the largest ocean on Earth?', 'Pacific', 'Atlantic', 'Indian', 'Arctic', 'Geography'],
  ['What is the capital of Japan?', 'Tokyo', 'Kyoto', 'Osaka', 'Seoul', 'Geography'],
  ['Which is the longest river in Africa?', 'Nile', 'Congo', 'Niger', 'Zambezi', 'Geography'],
  ['Which country has the most people?', 'India', 'China', 'USA', 'Indonesia', 'Geography'],
  ['What is the capital of Kenya?', 'Nairobi', 'Mombasa', 'Kampala', 'Addis Ababa', 'Geography'],
  ['Mount Everest is on the border of Nepal and…', 'China', 'India', 'Bhutan', 'Pakistan', 'Geography'],
  ['Which desert is the largest hot desert?', 'Sahara', 'Gobi', 'Kalahari', 'Atacama', 'Geography'],
  ['What is the capital of Brazil?', 'Brasília', 'Rio de Janeiro', 'São Paulo', 'Buenos Aires', 'Geography'],
  ['How many continents are there?', '7', '5', '6', '8', 'Geography'],
  ['Which city is called the Big Apple?', 'New York', 'Los Angeles', 'Chicago', 'Boston', 'Geography'],
  ['What is the capital of Australia?', 'Canberra', 'Sydney', 'Melbourne', 'Perth', 'Geography'],
  ['Which is the smallest country in the world?', 'Vatican City', 'Monaco', 'Malta', 'San Marino', 'Geography'],
  ['What saves the most CO₂ on a 5 km trip?', 'Cycling', 'A petrol car', 'A taxi', 'A motorbike', 'Climate'],
  ['Which gas is the main cause of global warming?', 'Carbon dioxide', 'Oxygen', 'Argon', 'Helium', 'Climate'],
  ['Which energy source is renewable?', 'Wind', 'Coal', 'Oil', 'Natural gas', 'Climate'],
  ['About how much CO₂ does a young tree take up a year?', 'About 22 kg', 'About 2 kg', 'About 200 kg', 'About 2 tonnes', 'Climate'],
  ['What does recycling an aluminium can save most of?', 'Energy', 'Water', 'Paper', 'Time', 'Climate'],
  ['Which of these can go in a compost bin?', 'Banana peel', 'Glass jar', 'Battery', 'Plastic bag', 'Climate'],
  ['Melting sea ice mostly affects which animal?', 'Polar bear', 'Camel', 'Kangaroo', 'Lion', 'Climate'],
  ['Which light bulb uses the least energy?', 'LED', 'Incandescent', 'Halogen', 'Gas lamp', 'Climate'],
  ['What does CPU stand for?', 'Central Processing Unit', 'Computer Power Unit', 'Core Program Utility', 'Central Print Unit', 'Technology'],
  ['How many bits are in a byte?', '8', '4', '16', '10', 'Technology'],
  ['What does “www” stand for?', 'World Wide Web', 'Wide World Web', 'Web World Wide', 'World Web Wire', 'Technology'],
  ['Which number system do computers use at heart?', 'Binary', 'Decimal', 'Roman', 'Hexadecimal only', 'Technology'],
  ['What does a QR code store?', 'Text or a link', 'Electricity', 'A photo only', 'Sound only', 'Technology'],
  ['Which of these is a programming language?', 'Python', 'Cobra', 'Viper', 'Anaconda', 'Technology'],
  ['Who wrote “Romeo and Juliet”?', 'Shakespeare', 'Dickens', 'Tolstoy', 'Austen', 'Culture'],
  ['How many players are on a football team on the pitch?', '11', '9', '10', '12', 'Culture'],
  ['Which instrument has 88 keys?', 'Piano', 'Guitar', 'Violin', 'Flute', 'Culture'],
  ['Which colour do you get mixing blue and yellow?', 'Green', 'Purple', 'Orange', 'Brown', 'Culture'],
  ['How many sides does a hexagon have?', '6', '5', '7', '8', 'Maths'],
  ['What is the square root of 144?', '12', '14', '11', '16', 'Maths'],
  ['What is 15% of 200?', '30', '15', '20', '35', 'Maths'],
  ['How many degrees are in a right angle?', '90', '45', '180', '60', 'Maths'],
  ['What is the next prime after 7?', '11', '9', '13', '10', 'Maths'],
  ['What is π rounded to two decimals?', '3.14', '3.41', '3.12', '3.16', 'Maths'],
  ['How many minutes are in 3 hours?', '180', '120', '160', '200', 'Maths'],
  ['Which fraction equals 0.25?', '1/4', '1/2', '1/3', '2/5', 'Maths'],
  // M35: sixty more.
  ['What part of a cell holds its genetic material?', 'The nucleus', 'The membrane', 'The ribosome', 'The cytoplasm', 'Science'],
  ['Which gas makes up most of the air we breathe?', 'Nitrogen', 'Oxygen', 'Carbon dioxide', 'Argon', 'Science'],
  ['What is the chemical symbol for gold?', 'Au', 'Ag', 'Gd', 'Go', 'Science'],
  ['How many planets are in our solar system?', '8', '9', '7', '10', 'Science'],
  ['What is the largest planet in our solar system?', 'Jupiter', 'Saturn', 'Neptune', 'Earth', 'Science'],
  ['Which vitamin does sunlight help your body make?', 'Vitamin D', 'Vitamin C', 'Vitamin A', 'Vitamin K', 'Science'],
  ['What is light’s speed, roughly?', '300,000 km a second', '30,000 km a second', '3,000 km a second', '3 million km a second', 'Science'],
  ['Which organs clean your blood?', 'The kidneys', 'The lungs', 'The stomach', 'The heart', 'Science'],
  ['What kind of animal is a whale?', 'A mammal', 'A fish', 'A reptile', 'An amphibian', 'Science'],
  ['Which planet is named after the Roman god of war?', 'Mars', 'Jupiter', 'Mercury', 'Saturn', 'Science'],
  ['What is the capital of Canada?', 'Ottawa', 'Toronto', 'Vancouver', 'Montreal', 'Geography'],
  ['What is the capital of Egypt?', 'Cairo', 'Alexandria', 'Luxor', 'Giza', 'Geography'],
  ['Which mountains run down South America’s west side?', 'The Andes', 'The Alps', 'The Rockies', 'The Himalayas', 'Geography'],
  ['What is the capital of India?', 'New Delhi', 'Mumbai', 'Kolkata', 'Bengaluru', 'Geography'],
  ['What is the largest country by area?', 'Russia', 'Canada', 'China', 'USA', 'Geography'],
  ['Which ocean lies between Africa and Australia?', 'Indian', 'Pacific', 'Atlantic', 'Southern', 'Geography'],
  ['What is the capital of Argentina?', 'Buenos Aires', 'Córdoba', 'Santiago', 'Lima', 'Geography'],
  ['Which country is shaped like a boot?', 'Italy', 'Greece', 'Portugal', 'Chile', 'Geography'],
  ['What is the capital of Nigeria?', 'Abuja', 'Lagos', 'Kano', 'Accra', 'Geography'],
  ['Which is the tallest waterfall in the world?', 'Angel Falls', 'Niagara Falls', 'Victoria Falls', 'Iguazu Falls', 'Geography'],
  ['What is the capital of South Korea?', 'Seoul', 'Busan', 'Tokyo', 'Beijing', 'Geography'],
  ['Which river flows through London?', 'The Thames', 'The Seine', 'The Danube', 'The Rhine', 'Geography'],
  ['What do solar panels turn into electricity?', 'Sunlight', 'Wind', 'Ground heat', 'Rain', 'Climate'],
  ['Which trip makes the most CO₂ per person per km?', 'A short flight', 'A train', 'A bus', 'A bike ride', 'Climate'],
  ['What is the main gas in natural gas?', 'Methane', 'Propane', 'Hydrogen', 'Ozone', 'Climate'],
  ['Which layer shields us from the Sun’s UV light?', 'The ozone layer', 'The clouds', 'The ionosphere', 'The magnetosphere', 'Climate'],
  ['Clearing forests for good is called…', 'Deforestation', 'Afforestation', 'Erosion', 'Composting', 'Climate'],
  ['Which food usually has the biggest carbon footprint per kilo?', 'Beef', 'Lentils', 'Potatoes', 'Rice', 'Climate'],
  ['Sea levels rise from melting ice and…', 'Warming water expanding', 'More rain', 'Earthquakes', 'Stronger tides', 'Climate'],
  ['Which of these is a renewable source of power?', 'Hydropower', 'Diesel', 'Coal', 'Petrol', 'Climate'],
  ['What does “AI” stand for?', 'Artificial intelligence', 'Automated internet', 'Advanced input', 'Analogue interface', 'Technology'],
  ['Which company made the first iPhone?', 'Apple', 'Nokia', 'Samsung', 'Google', 'Technology'],
  ['What does a router do?', 'Passes data between networks', 'Prints pages', 'Stores photos', 'Charges phones', 'Technology'],
  ['Which of these is an operating system?', 'Linux', 'Photoshop', 'Excel', 'Wikipedia', 'Technology'],
  ['Which code uses dots and dashes?', 'Morse code', 'Binary', 'A QR code', 'A barcode', 'Technology'],
  ['What does “Wi-Fi” let devices do?', 'Connect without cables', 'Charge faster', 'Take photos', 'Print in colour', 'Technology'],
  ['What is a pixel?', 'A dot on a screen', 'A type of cable', 'A virus', 'A battery', 'Technology'],
  ['Which key is used to remove the character before the cursor?', 'Backspace', 'Shift', 'Tab', 'Escape', 'Technology'],
  ['Who painted the Mona Lisa?', 'Leonardo da Vinci', 'Michelangelo', 'Van Gogh', 'Picasso', 'Culture'],
  ['How many strings does a standard guitar have?', '6', '4', '5', '8', 'Culture'],
  ['Where were the ancient Olympic Games held?', 'Greece', 'Italy', 'Egypt', 'France', 'Culture'],
  ['How many players does a basketball team have on court?', '5', '6', '7', '11', 'Culture'],
  ['Which language has the most native speakers?', 'Mandarin Chinese', 'English', 'Spanish', 'Hindi', 'Culture'],
  ['How many colours are in a rainbow, traditionally?', '7', '5', '6', '8', 'Culture'],
  ['Who wrote the Harry Potter books?', 'J.K. Rowling', 'Roald Dahl', 'C.S. Lewis', 'J.R.R. Tolkien', 'Culture'],
  ['How many days are in a leap year?', '366', '365', '364', '360', 'Culture'],
  ['What is 7 × 8?', '56', '54', '64', '48', 'Maths'],
  ['How many sides does a pentagon have?', '5', '6', '4', '8', 'Maths'],
  ['What is 25% of 80?', '20', '25', '16', '40', 'Maths'],
  ['What comes next: 2, 4, 8, 16…?', '32', '24', '20', '64', 'Maths'],
  ['How many seconds are in an hour?', '3,600', '360', '6,000', '1,200', 'Maths'],
  ['What is 1/2 + 1/4?', '3/4', '2/6', '1/6', '2/4', 'Maths'],
  ['What do a triangle’s angles add up to?', '180°', '360°', '90°', '270°', 'Maths'],
  ['What is 12 squared?', '144', '124', '122', '164', 'Maths'],
  ['Which of these numbers is prime?', '13', '15', '21', '27', 'Maths'],
  ['How many zeros are in one million?', '6', '5', '7', '9', 'Maths'],
  ['What is 9 × 9?', '81', '72', '99', '89', 'Maths'],
  ['What is half of 250?', '125', '120', '150', '115', 'Maths'],
  ['How many centimetres are in a metre?', '100', '10', '1,000', '60', 'Maths'],
  ['What is 0.5 as a percentage?', '50%', '5%', '0.5%', '500%', 'Maths'],
];

/** A made-up arithmetic question with three close wrong answers. */
function maths(rand: () => number): Omit<QuizQuestion, 'options' | 'answer'> & { right: number; wrong: number[] } {
  const kind = Math.floor(rand() * 4);
  const a = 2 + Math.floor(rand() * 18), b = 2 + Math.floor(rand() * 12);
  const [q, right] = kind === 0 ? [`${a * 3} + ${b * 7} = ?`, a * 3 + b * 7]
    : kind === 1 ? [`${a * 4 + b * 9} − ${b * 4} = ?`, a * 4 + b * 5]
      : kind === 2 ? [`${a} × ${b} = ?`, a * b]
        : [`${a * b} ÷ ${b} = ?`, a];
  const near = new Set<number>();
  for (const d of [1, -1, 2, -2, 10, -10, b, -b, 3, 4]) if (near.size < 3 && d !== 0 && right + d >= 0) near.add(right + d);
  return { q, topic: 'Quick maths', right, wrong: [...near].slice(0, 3) };
}

/** The i-th question of a round: bank questions in a seeded order, every third one maths. */
export function quizQuestion(seed: number, i: number): QuizQuestion {
  const rand = seeded(hash(`${seed}:quiz:${i}`));
  let q: string, topic: string, right: string, wrong: string[];
  if (i % 3 === 2) {
    const m = maths(rand);
    ({ q, topic } = m);
    right = String(m.right);
    wrong = m.wrong.map(String);
  } else {
    const order = shuffled(BANK.map((_, k) => k), `${seed}:bank`);
    const row = BANK[order[(i - Math.floor(i / 3)) % BANK.length]];
    [q, right] = row;
    wrong = row.slice(2, 5);
    topic = row[5];
  }
  const options = shuffled([right, ...wrong], `${seed}:opts:${i}`);
  return { q, topic, options, answer: options.indexOf(right) };
}

export const QUIZ_SECONDS_PER_QUESTION = 10;
/** The last seconds of a round are the lightning round: every answer counts double. */
export const QUIZ_LIGHTNING_MS = 15_000;
/** Each power-up once a round: two wrong answers gone, five more seconds, double points. */
export const QUIZ_POWERS = ['half', 'time', 'double'] as const;
export type QuizPower = (typeof QUIZ_POWERS)[number];

/** Two wrong answers to hide for 50:50, the same for everyone with the same seed. */
export function quizHalf(seed: number, i: number, q: QuizQuestion): number[] {
  return shuffled(q.options.map((_, k) => k).filter((k) => k !== q.answer), `${seed}:half:${i}`).slice(0, 2);
}

/** Points for an answer: 100 if right, up to 50 more for speed, a streak bonus from the third in a
 *  row, times `mult` (double points, the lightning round). */
export function quizPoints(right: boolean, msLeft: number, streak: number, mult = 1): number {
  if (!right) return 0;
  const speed = Math.round(50 * Math.max(0, Math.min(1, msLeft / (QUIZ_SECONDS_PER_QUESTION * 1000))));
  return (100 + speed + (streak >= 3 ? 25 * Math.min(streak - 2, 4) : 0)) * mult;
}
