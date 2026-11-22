// The examples Relief's own AI learns from (M420; trained by train-relief.mts). Made up by hand, since
// UniVerse has almost no real requests yet. Two kinds:
//  - REAL_LIKE: whole messages written the way people really write them (typos, no punctuation, SMS
//    style, a few in romanised Hindi). Part of them is kept aside to test the model honestly.
//  - Building blocks (WHO, NEEDS, CUES) that the training script joins into thousands of messages.
//
// What the urgencies mean (the labels follow these, so the model learns them):
//  CRITICAL: a life is in danger now (trapped, not breathing, heavy bleeding, water rising, fire).
//  HIGH:     harm today if nobody comes (no water at all, out of insulin, nowhere to sleep tonight).
//  MEDIUM:   a real need that can wait a day (food for the week, blankets, a ride to an appointment).
//  LOW:      nice to have, no rush (books, spare clothes some time, help moving next week).

export type U = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type K = 'FOOD' | 'WATER' | 'SHELTER' | 'MEDICAL' | 'TRANSPORT' | 'CLOTHES' | 'OTHER';

export const REAL_LIKE: [U, K, string][] = [
  ['CRITICAL', 'SHELTER', 'SOS 3 children trapped, house flooded'],
  ['CRITICAL', 'SHELTER', 'water rising fast we are on the roof with grandma pls send boat'],
  ['CRITICAL', 'MEDICAL', 'my father collapsed and is not breathing properly, ambulance not answering'],
  ['CRITICAL', 'MEDICAL', 'man bleeding heavily from his leg near the bridge'],
  ['CRITICAL', 'MEDICAL', 'baby has a very high fever and is not waking up'],
  ['CRITICAL', 'MEDICAL', 'chest pain and cant breathe, alone at home'],
  ['CRITICAL', 'SHELTER', 'building cracked after the quake, people stuck on 2nd floor'],
  ['CRITICAL', 'OTHER', 'fire spreading to our street, elderly neighbour cannot walk out'],
  ['CRITICAL', 'MEDICAL', 'pregnant woman in labour, roads blocked, bleeding'],
  ['CRITICAL', 'MEDICAL', 'someone unconscious in the shelter, not responding'],
  ['CRITICAL', 'SHELTER', 'trapped under rubble, can hear voices, 2 people'],
  ['CRITICAL', 'MEDICAL', 'my son is having a seizure that wont stop'],
  ['CRITICAL', 'SHELTER', 'car swept by flood water, family inside holding on'],
  ['CRITICAL', 'MEDICAL', 'diabetic woman unconscious, no insulin for days'],
  ['CRITICAL', 'OTHER', 'gas leak smell in the camp, kids sleeping inside'],
  ['CRITICAL', 'MEDICAL', 'madad karo jaldi, papa behosh ho gaye, saans nahi le rahe'],
  ['CRITICAL', 'SHELTER', 'paani bahut tez badh raha hai, chhat par fase hain, boat bhejo'],
  ['CRITICAL', 'MEDICAL', 'emergency!! snake bite, leg swelling fast, village far from hospital'],
  ['CRITICAL', 'MEDICAL', 'old man fell, head injury, blood everywhere, not talking'],
  ['CRITICAL', 'SHELTER', 'landslide hit our house 4 people missing inside'],
  ['CRITICAL', 'MEDICAL', 'overdose, my friend is turning blue'],
  ['CRITICAL', 'WATER', 'child drinking flood water now vomiting and very weak, no clean water'],
  ['CRITICAL', 'OTHER', 'stuck in lift since the blackout, very hot, an old lady fainted'],
  ['CRITICAL', 'MEDICAL', 'severe allergic reaction, throat closing, no epipen'],

  ['HIGH', 'MEDICAL', 'My mother needs insulin urgently and a ride'],
  ['HIGH', 'WATER', 'no drinking water since yesterday for 6 of us incl 2 babies'],
  ['HIGH', 'FOOD', 'Family of 5, no food since yesterday'],
  ['HIGH', 'FOOD', 'baby formula finished, shops closed, need some tonight'],
  ['HIGH', 'SHELTER', 'house destroyed, nowhere to sleep tonight, 4 kids'],
  ['HIGH', 'MEDICAL', 'out of heart medicine, last pill was this morning'],
  ['HIGH', 'SHELTER', 'elderly couple without heating, its freezing tonight'],
  ['HIGH', 'TRANSPORT', 'stranded at the bus station with two kids, getting dark'],
  ['HIGH', 'MEDICAL', 'broke my arm in the storm, swollen, need someone to take a look today'],
  ['HIGH', 'WATER', 'well is contaminated, whole street has no clean water'],
  ['HIGH', 'MEDICAL', 'need dialysis tomorrow, hospital transport cancelled'],
  ['HIGH', 'FOOD', 'we have not eaten for two days, please'],
  ['HIGH', 'MEDICAL', 'asthma inhaler empty, my daughter is wheezing'],
  ['HIGH', 'SHELTER', 'roof blew off, rain coming in, need tarp asap'],
  ['HIGH', 'CLOTHES', 'kids soaked through, no dry clothes, very cold night'],
  ['HIGH', 'TRANSPORT', 'need a ride to the hospital today for chemo, no car'],
  ['HIGH', 'WATER', 'paani khatam ho gaya, bachche pyase hain, aaj chahiye'],
  ['HIGH', 'FOOD', 'khana nahi hai do din se, 5 log hain'],
  ['HIGH', 'MEDICAL', 'dawai khatam, sugar ki dawai aaj chahiye'],
  ['HIGH', 'MEDICAL', 'wound looks infected, red and hot, fever since morning'],
  ['HIGH', 'SHELTER', 'evacuated with nothing, need a place to stay tonight for 3'],
  ['HIGH', 'OTHER', 'phone dying and I cant reach my family after the flood, need charging today'],
  ['HIGH', 'FOOD', 'running out of food, 1 day left, 8 people in the camp'],
  ['HIGH', 'MEDICAL', 'grandma ran out of oxygen cylinder, power is out'],
  ['HIGH', 'TRANSPORT', 'urgent: need a van to move a disabled man out before the road floods'],
  ['HIGH', 'WATER', 'need water asap, hot day, old people here are dizzy'],

  ['MEDIUM', 'FOOD', 'food for a family of 4 for the week would help a lot'],
  ['MEDIUM', 'SHELTER', 'need blankets and a tent for a few nights'],
  ['MEDIUM', 'TRANSPORT', 'ride to the clinic on thursday for my check up'],
  ['MEDIUM', 'CLOTHES', 'clothes for 2 children aged 5 and 8, lost everything'],
  ['MEDIUM', 'WATER', 'bottled water for the shelter, running lower than usual'],
  ['MEDIUM', 'MEDICAL', 'need pain killers and bandages for small cuts'],
  ['MEDIUM', 'FOOD', 'rice and lentils for our community kitchen'],
  ['MEDIUM', 'OTHER', 'help clearing mud out of the ground floor'],
  ['MEDIUM', 'CLOTHES', 'winter jackets for 3 adults'],
  ['MEDIUM', 'SHELTER', 'mattresses for the school hall where we sleep'],
  ['MEDIUM', 'TRANSPORT', 'need someone to drive supplies to the village this weekend'],
  ['MEDIUM', 'MEDICAL', 'looking for a doctor to check on my dad, cough for a week'],
  ['MEDIUM', 'OTHER', 'someone who speaks arabic to help fill in forms'],
  ['MEDIUM', 'FOOD', 'groceries for a single mum with a baby'],
  ['MEDIUM', 'CLOTHES', 'nappies size 3 and baby clothes'],
  ['MEDIUM', 'WATER', 'water filter for our house, tap water tastes off'],
  ['MEDIUM', 'OTHER', 'phone charger and power bank'],
  ['MEDIUM', 'FOOD', 'kuch khana chahiye family ke liye is hafte'],
  ['MEDIUM', 'SHELTER', 'tarps to fix the shed roof before next rain'],
  ['MEDIUM', 'TRANSPORT', 'lift to the relief centre to collect our papers'],
  ['MEDIUM', 'OTHER', 'help repairing a broken window'],
  ['MEDIUM', 'MEDICAL', 'need a wheelchair for my grandmother'],
  ['MEDIUM', 'CLOTHES', 'shoes for school kids size 2 and 4'],
  ['MEDIUM', 'FOOD', 'milk and bread for the elderly in our building'],

  ['LOW', 'OTHER', 'books and toys for the kids at the shelter, no rush'],
  ['LOW', 'CLOTHES', 'any spare clothes some time next week'],
  ['LOW', 'TRANSPORT', 'help moving furniture back next weekend'],
  ['LOW', 'OTHER', 'someone to help with homework for my son when you have time'],
  ['LOW', 'FOOD', 'would be nice to have some snacks for the volunteers'],
  ['LOW', 'OTHER', 'paint and brushes to redo the community hall later this month'],
  ['LOW', 'CLOTHES', 'warm socks for winter, whenever you can'],
  ['LOW', 'SHELTER', 'extra pillows if anyone has spare ones, not urgent'],
  ['LOW', 'OTHER', 'looking for a volunteer to teach english on saturdays'],
  ['LOW', 'TRANSPORT', 'a bike for my daughter to get to school, no hurry'],
  ['LOW', 'OTHER', 'garden tools to replant the park, any time'],
  ['LOW', 'FOOD', 'spices and tea for the kitchen, whenever someone passes by'],
  ['LOW', 'CLOTHES', 'a suit for a job interview next month'],
  ['LOW', 'OTHER', 'board games for the evenings at the camp'],
  ['LOW', 'OTHER', 'koi jaldi nahi, bachchon ke liye kitabein chahiye'],
  ['LOW', 'WATER', 'a few water bottles for the football practice next week'],
  ['LOW', 'MEDICAL', 'reading glasses for my aunt, not urgent'],
  ['LOW', 'SHELTER', 'curtains for the new flat, when possible'],
  ['LOW', 'OTHER', 'old laptop for my studies if anyone has one spare'],
  ['LOW', 'TRANSPORT', 'carpool to the community meeting next month'],
];

/** Who it's for (said at the start), mixed into the built messages. */
export const WHO = ['', '', 'we need', 'I need', 'family of #', '# people need', 'my mother needs', 'my grandfather needs', 'our camp needs', '# kids need', 'elderly neighbour needs', 'single mum needs', 'the shelter needs', 'pls', 'hello, we need', 'humein chahiye', 'our village needs'];

/** What's needed: [base urgency, kind, phrase]. */
export const NEEDS: [U, K, string][] = [
  ['MEDIUM', 'FOOD', 'food'], ['MEDIUM', 'FOOD', 'rice and flour'], ['MEDIUM', 'FOOD', 'meals for the family'], ['MEDIUM', 'FOOD', 'groceries'], ['MEDIUM', 'FOOD', 'bread and milk'], ['MEDIUM', 'FOOD', 'cooked meals'], ['MEDIUM', 'FOOD', 'khana'], ['HIGH', 'FOOD', 'baby formula'], ['MEDIUM', 'FOOD', 'canned food'], ['MEDIUM', 'FOOD', 'something to eat'], ['LOW', 'FOOD', 'snacks'], ['MEDIUM', 'FOOD', 'dal chawal'],
  ['MEDIUM', 'WATER', 'drinking water'], ['MEDIUM', 'WATER', 'bottled water'], ['MEDIUM', 'WATER', 'clean water'], ['MEDIUM', 'WATER', 'water purification tablets'], ['MEDIUM', 'WATER', 'paani'], ['MEDIUM', 'WATER', 'a water tank refill'], ['MEDIUM', 'WATER', 'jerry cans of water'],
  ['MEDIUM', 'SHELTER', 'a tent'], ['MEDIUM', 'SHELTER', 'blankets'], ['MEDIUM', 'SHELTER', 'a place to sleep'], ['MEDIUM', 'SHELTER', 'tarpaulin for the roof'], ['MEDIUM', 'SHELTER', 'mattresses'], ['MEDIUM', 'SHELTER', 'sleeping bags'], ['MEDIUM', 'SHELTER', 'a room for a few nights'], ['MEDIUM', 'SHELTER', 'shelter'], ['MEDIUM', 'SHELTER', 'rehne ki jagah'],
  ['MEDIUM', 'MEDICAL', 'medicine'], ['HIGH', 'MEDICAL', 'insulin'], ['MEDIUM', 'MEDICAL', 'a doctor'], ['MEDIUM', 'MEDICAL', 'a nurse to check a wound'], ['MEDIUM', 'MEDICAL', 'first aid kit'], ['MEDIUM', 'MEDICAL', 'bandages'], ['HIGH', 'MEDICAL', 'blood pressure pills'], ['MEDIUM', 'MEDICAL', 'dawai'], ['HIGH', 'MEDICAL', 'an inhaler'], ['MEDIUM', 'MEDICAL', 'a wheelchair'], ['MEDIUM', 'MEDICAL', 'pain killers'], ['HIGH', 'MEDICAL', 'an oxygen cylinder'], ['MEDIUM', 'MEDICAL', 'sanitary pads'],
  ['MEDIUM', 'TRANSPORT', 'a ride'], ['MEDIUM', 'TRANSPORT', 'a lift to the hospital'], ['MEDIUM', 'TRANSPORT', 'a car to the station'], ['MEDIUM', 'TRANSPORT', 'a van to move things'], ['MEDIUM', 'TRANSPORT', 'transport to the relief camp'], ['MEDIUM', 'TRANSPORT', 'a driver'], ['MEDIUM', 'TRANSPORT', 'a truck for supplies'], ['MEDIUM', 'TRANSPORT', 'gaadi'],
  ['MEDIUM', 'CLOTHES', 'clothes'], ['MEDIUM', 'CLOTHES', 'warm jackets'], ['MEDIUM', 'CLOTHES', 'shoes'], ['MEDIUM', 'CLOTHES', 'nappies'], ['MEDIUM', 'CLOTHES', 'diapers'], ['MEDIUM', 'CLOTHES', 'baby clothes'], ['MEDIUM', 'CLOTHES', 'school uniforms'], ['MEDIUM', 'CLOTHES', 'kapde'], ['MEDIUM', 'CLOTHES', 'coats and gloves'],
  ['MEDIUM', 'OTHER', 'help clearing debris'], ['MEDIUM', 'OTHER', 'a phone charger'], ['MEDIUM', 'OTHER', 'a translator'], ['MEDIUM', 'OTHER', 'help filling in forms'], ['LOW', 'OTHER', 'toys for children'], ['LOW', 'OTHER', 'books'], ['MEDIUM', 'OTHER', 'tools to fix the house'], ['MEDIUM', 'OTHER', 'a generator'], ['MEDIUM', 'OTHER', 'help finding my family'], ['MEDIUM', 'OTHER', 'someone to fix the door'], ['LOW', 'OTHER', 'a volunteer teacher'], ['MEDIUM', 'OTHER', 'torch and batteries'],
  ['MEDIUM', 'FOOD', 'fruit and vegetables'], ['MEDIUM', 'FOOD', 'cooking oil and sugar'], ['MEDIUM', 'FOOD', 'food packets'], ['MEDIUM', 'FOOD', 'atta and dal'], ['LOW', 'FOOD', 'tea and biscuits'],
  ['MEDIUM', 'WATER', 'water for drinking and cooking'], ['MEDIUM', 'WATER', 'a water filter'], ['HIGH', 'WATER', 'safe water, the well is dirty'], ['MEDIUM', 'WATER', 'water bottles'], ['MEDIUM', 'WATER', 'peene ka paani'],
  ['MEDIUM', 'SHELTER', 'pillows and bedding'], ['MEDIUM', 'SHELTER', 'a roof over our heads'], ['MEDIUM', 'SHELTER', 'plastic sheets for the hut'], ['MEDIUM', 'SHELTER', 'somewhere dry to stay'], ['MEDIUM', 'SHELTER', 'a heater for the room'], ['HIGH', 'SHELTER', 'a safe place, our house collapsed'], ['MEDIUM', 'SHELTER', 'a bed for the night'],
  ['MEDIUM', 'MEDICAL', 'glasses'], ['MEDIUM', 'MEDICAL', 'a hearing aid battery'], ['MEDIUM', 'MEDICAL', 'cough syrup'], ['MEDIUM', 'MEDICAL', 'antibiotics'], ['MEDIUM', 'MEDICAL', 'a health check'], ['HIGH', 'MEDICAL', 'sugar ki dawai'], ['MEDIUM', 'MEDICAL', 'crutches'], ['MEDIUM', 'MEDICAL', 'ORS packets'], ['MEDIUM', 'MEDICAL', 'someone to see the baby, rash'], ['MEDIUM', 'MEDICAL', 'doctor sahab'],
  ['MEDIUM', 'TRANSPORT', 'someone to drive us'], ['MEDIUM', 'TRANSPORT', 'a boat to cross'], ['MEDIUM', 'TRANSPORT', 'a ride to the chemo appointment'], ['MEDIUM', 'TRANSPORT', 'a lift home'], ['MEDIUM', 'TRANSPORT', 'fuel for the car'], ['MEDIUM', 'TRANSPORT', 'a bus ticket'], ['MEDIUM', 'TRANSPORT', 'pick up from the airport'],
  ['MEDIUM', 'CLOTHES', 'socks and underwear'], ['MEDIUM', 'CLOTHES', 'dry clothes'], ['MEDIUM', 'CLOTHES', 'sweaters'], ['MEDIUM', 'CLOTHES', 'rain coats'], ['MEDIUM', 'CLOTHES', 'sandals'], ['MEDIUM', 'CLOTHES', 'a dress for my daughter'],
  ['MEDIUM', 'OTHER', 'phone charging'], ['MEDIUM', 'OTHER', 'a power bank'], ['LOW', 'OTHER', 'board games'], ['LOW', 'OTHER', 'garden tools'], ['MEDIUM', 'OTHER', 'help to dig out the car'], ['MEDIUM', 'OTHER', 'a plumber'], ['MEDIUM', 'OTHER', 'an electrician'], ['MEDIUM', 'OTHER', 'help with the paperwork'], ['LOW', 'OTHER', 'paint for the school'], ['MEDIUM', 'OTHER', 'soap and toothpaste'], ['MEDIUM', 'OTHER', 'someone to sit with grandma'], ['MEDIUM', 'OTHER', 'internet to call my family'],
];

/** Words that move the urgency: CRITICAL and LOW set it; HIGH raises a lower one. */
export const CUES: [U, string][] = [
  ['CRITICAL', 'SOS'], ['CRITICAL', 'emergency, someone is dying'], ['CRITICAL', 'trapped by the flood'], ['CRITICAL', 'water rising, we are on the roof'], ['CRITICAL', 'he is not breathing'], ['CRITICAL', 'she is unconscious'], ['CRITICAL', 'bleeding a lot'], ['CRITICAL', 'house on fire'], ['CRITICAL', 'stuck under rubble'], ['CRITICAL', 'life in danger'], ['CRITICAL', 'jaan khatre mein hai'], ['CRITICAL', 'heart attack'], ['CRITICAL', 'child is not responding'],
  ['CRITICAL', 'cannot breathe'], ['CRITICAL', 'saans nahi aa rahi'], ['CRITICAL', 'behosh ho gaya'], ['CRITICAL', 'people stuck inside after the quake'], ['CRITICAL', 'the car is being swept away'], ['CRITICAL', 'drowning'], ['CRITICAL', 'collapsed'], ['CRITICAL', 'heavy bleeding'], ['CRITICAL', 'roof caving in on us'], ['CRITICAL', 'help now or he dies'], ['CRITICAL', 'turning blue'], ['CRITICAL', 'fainted and not waking'],
  ['HIGH', 'urgent'], ['HIGH', 'urgently'], ['HIGH', 'asap'], ['HIGH', 'tonight'], ['HIGH', 'right now please'], ['HIGH', 'today, none left'], ['HIGH', 'ran out yesterday'], ['HIGH', 'nothing since 2 days'], ['HIGH', 'jaldi'], ['HIGH', 'immediately'], ['HIGH', 'before dark'], ['HIGH', 'the baby is crying with hunger'], ['HIGH', 'it is freezing'],
  ['HIGH', 'today'], ['HIGH', 'aaj hi'], ['HIGH', 'none left at all'], ['HIGH', 'since yesterday'], ['HIGH', 'the kids are sick from it'], ['HIGH', 'last one finished this morning'], ['HIGH', 'please hurry'], ['HIGH', 'it cannot wait'], ['HIGH', 'turant'], ['HIGH', 'in the next few hours'],
  ['LOW', 'no rush'], ['LOW', 'whenever you can'], ['LOW', 'not urgent'], ['LOW', 'next week is fine'], ['LOW', 'when someone has time'], ['LOW', 'would be nice'], ['LOW', 'koi jaldi nahi'], ['LOW', 'some time this month'], ['LOW', 'if anyone has spare'],
  ['LOW', 'any time'], ['LOW', 'later is fine'], ['LOW', 'for the weekend activities'], ['LOW', 'just if possible'], ['LOW', 'baad mein bhi chalega'], ['LOW', 'when convenient'], ['LOW', 'for later this month'],
];

/** Emergencies said on their own, with no separate "need": what kind of help they are (all CRITICAL). */
export const ALONE: [K, string][] = [
  ['SHELTER', 'trapped by the flood'], ['SHELTER', 'water rising, we are on the roof'], ['SHELTER', 'stuck under rubble'], ['SHELTER', 'people stuck inside after the quake'], ['SHELTER', 'roof caving in on us'], ['SHELTER', 'house flooded, kids trapped upstairs'], ['SHELTER', 'building collapsed, people inside'], ['SHELTER', 'family stuck in the car in flood water'], ['SHELTER', 'wall fell on the house, cannot get out'], ['SHELTER', 'ghar mein paani bhar gaya, fase hain'],
  ['MEDICAL', 'he is not breathing'], ['MEDICAL', 'she is unconscious'], ['MEDICAL', 'bleeding a lot'], ['MEDICAL', 'heavy bleeding from the leg'], ['MEDICAL', 'heart attack'], ['MEDICAL', 'child is not responding'], ['MEDICAL', 'cannot breathe'], ['MEDICAL', 'saans nahi aa rahi'], ['MEDICAL', 'behosh ho gaya'], ['MEDICAL', 'collapsed on the floor'], ['MEDICAL', 'turning blue'], ['MEDICAL', 'fainted and not waking'], ['MEDICAL', 'seizure not stopping'], ['MEDICAL', 'woman in labour, bleeding'], ['MEDICAL', 'head injury, not talking'],
  ['OTHER', 'house on fire'], ['OTHER', 'fire spreading, people inside'], ['OTHER', 'gas leak in the building'], ['OTHER', 'stuck in the lift, someone fainted'], ['OTHER', 'live wire fallen on the street, kids nearby'],
  ['WATER', 'kids drank dirty flood water, vomiting and weak'],
  ['TRANSPORT', 'need a boat now, people drowning'],
];
