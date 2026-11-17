// M241: a trip's phrasebook. The phrases a traveller needs most (greetings, thanks, getting by, directions, food and
// allergies, help, numbers) in the main language of the trip's countries, each with how to say it when the script
// isn't Latin, and the browser's own voice (speechSynthesis) to read it out. Written for UniVerse; the polite forms.
// Tested in travel-phrases.test.ts.

export const PHRASES = [
  ['hello', 'Hello', 'greet'], ['bye', 'Goodbye', 'greet'], ['please', 'Please', 'greet'], ['thanks', 'Thank you', 'greet'],
  ['yes', 'Yes', 'greet'], ['no', 'No', 'greet'], ['excuse', 'Excuse me', 'greet'], ['sorry', 'Sorry', 'greet'],
  ['dunno', 'I don’t understand', 'by'], ['english', 'Do you speak English?', 'by'], ['howmuch', 'How much is it?', 'by'], ['toilet', 'Where is the toilet?', 'by'],
  ['lost', 'I’m lost', 'way'], ['left', 'Left', 'way'], ['right', 'Right', 'way'], ['straight', 'Straight on', 'way'],
  ['bill', 'The bill, please', 'food'], ['water', 'Water, please', 'food'], ['veg', 'I’m vegetarian', 'food'], ['nuts', 'I’m allergic to nuts', 'food'],
  ['help', 'Help!', 'help'], ['doctor', 'Call a doctor!', 'help'], ['police', 'Call the police!', 'help'],
] as const;
export type PhraseKey = (typeof PHRASES)[number][0];
export const GROUPS = { greet: 'Greetings', by: 'Getting by', way: 'Directions', food: 'Food and allergies', help: 'Help' } as const;

export interface Language { id: string; name: string; tag: string; rtl?: boolean; phrases: Record<PhraseKey, { text: string; say?: string }>; numbers: { text: string; say?: string }[] }

/** A language from its phrases in PHRASES' order ("native|how to say it"), and the numbers 1–10 the same way. */
function lang(id: string, name: string, tag: string, rows: string[], numbers: string, rtl = false): Language {
  if (rows.length !== PHRASES.length) throw new Error(`${id}: ${rows.length} phrases`);
  const split = (s: string) => { const [text, say] = s.split('|'); return say ? { text, say } : { text }; };
  const nums = numbers.split(', ').map(split);
  if (nums.length !== 10) throw new Error(`${id}: ${nums.length} numbers`);
  return { id, name, tag, rtl, phrases: Object.fromEntries(PHRASES.map(([k], i) => [k, split(rows[i])])) as Language['phrases'], numbers: nums };
}

const es = ['Hola', 'Adiós', 'Por favor', 'Gracias', 'Sí', 'No', 'Disculpe', 'Lo siento', 'No entiendo', '¿Habla inglés?', '¿Cuánto cuesta?', '¿Dónde está el baño?',
  'Estoy perdido / perdida', 'A la izquierda', 'A la derecha', 'Todo recto', 'La cuenta, por favor', 'Agua, por favor', 'Soy vegetariano / vegetariana', 'Soy alérgico / alérgica a los frutos secos',
  '¡Socorro!', '¡Llame a un médico!', '¡Llame a la policía!'];
const pt = ['Olá', 'Adeus', 'Por favor', 'Obrigado / Obrigada', 'Sim', 'Não', 'Com licença', 'Desculpe', 'Não percebo', 'Fala inglês?', 'Quanto custa?', 'Onde é a casa de banho?',
  'Estou perdido / perdida', 'À esquerda', 'À direita', 'Sempre em frente', 'A conta, por favor', 'Água, por favor', 'Sou vegetariano / vegetariana', 'Sou alérgico / alérgica a frutos secos',
  'Socorro!', 'Chame um médico!', 'Chame a polícia!'];

export const LANGUAGES: Language[] = [
  lang('es', 'Spanish', 'es-ES', es, 'uno, dos, tres, cuatro, cinco, seis, siete, ocho, nueve, diez'),
  lang('es-419', 'Spanish (Latin America)', 'es-MX', es.map((p) => (p === 'Todo recto' ? 'Derecho' : p === 'Soy alérgico / alérgica a los frutos secos' ? 'Soy alérgico / alérgica a las nueces' : p)), 'uno, dos, tres, cuatro, cinco, seis, siete, ocho, nueve, diez'),
  lang('fr', 'French', 'fr-FR', ['Bonjour', 'Au revoir', 'S’il vous plaît', 'Merci', 'Oui', 'Non', 'Excusez-moi', 'Désolé / Désolée', 'Je ne comprends pas', 'Parlez-vous anglais ?', 'C’est combien ?', 'Où sont les toilettes ?',
    'Je suis perdu / perdue', 'À gauche', 'À droite', 'Tout droit', 'L’addition, s’il vous plaît', 'De l’eau, s’il vous plaît', 'Je suis végétarien / végétarienne', 'Je suis allergique aux fruits à coque',
    'Au secours !', 'Appelez un médecin !', 'Appelez la police !'], 'un, deux, trois, quatre, cinq, six, sept, huit, neuf, dix'),
  lang('de', 'German', 'de-DE', ['Hallo', 'Auf Wiedersehen', 'Bitte', 'Danke', 'Ja', 'Nein', 'Entschuldigung', 'Es tut mir leid', 'Ich verstehe nicht', 'Sprechen Sie Englisch?', 'Wie viel kostet das?', 'Wo ist die Toilette?',
    'Ich habe mich verlaufen', 'Links', 'Rechts', 'Geradeaus', 'Die Rechnung, bitte', 'Wasser, bitte', 'Ich bin Vegetarier / Vegetarierin', 'Ich bin allergisch gegen Nüsse',
    'Hilfe!', 'Rufen Sie einen Arzt!', 'Rufen Sie die Polizei!'], 'eins, zwei, drei, vier, fünf, sechs, sieben, acht, neun, zehn'),
  lang('it', 'Italian', 'it-IT', ['Buongiorno', 'Arrivederci', 'Per favore', 'Grazie', 'Sì', 'No', 'Mi scusi', 'Mi dispiace', 'Non capisco', 'Parla inglese?', 'Quanto costa?', 'Dov’è il bagno?',
    'Mi sono perso / persa', 'A sinistra', 'A destra', 'Sempre dritto', 'Il conto, per favore', 'Acqua, per favore', 'Sono vegetariano / vegetariana', 'Sono allergico / allergica alla frutta a guscio',
    'Aiuto!', 'Chiami un medico!', 'Chiami la polizia!'], 'uno, due, tre, quattro, cinque, sei, sette, otto, nove, dieci'),
  lang('pt', 'Portuguese', 'pt-PT', pt, 'um, dois, três, quatro, cinco, seis, sete, oito, nove, dez'),
  lang('pt-BR', 'Portuguese (Brazil)', 'pt-BR', pt.map((p) => (p === 'Adeus' ? 'Tchau' : p === 'Não percebo' ? 'Não entendo' : p === 'Onde é a casa de banho?' ? 'Onde fica o banheiro?' : p === 'Sou alérgico / alérgica a frutos secos' ? 'Sou alérgico / alérgica a castanhas' : p)), 'um, dois, três, quatro, cinco, seis, sete, oito, nove, dez'),
  lang('nl', 'Dutch', 'nl-NL', ['Hallo', 'Tot ziens', 'Alstublieft', 'Dank u wel', 'Ja', 'Nee', 'Pardon', 'Sorry', 'Ik begrijp het niet', 'Spreekt u Engels?', 'Hoeveel kost het?', 'Waar is het toilet?',
    'Ik ben verdwaald', 'Links', 'Rechts', 'Rechtdoor', 'De rekening, alstublieft', 'Water, alstublieft', 'Ik ben vegetariër', 'Ik ben allergisch voor noten',
    'Help!', 'Bel een dokter!', 'Bel de politie!'], 'een, twee, drie, vier, vijf, zes, zeven, acht, negen, tien'),
  lang('el', 'Greek', 'el-GR', ['Γεια σας|Yia sas', 'Αντίο|Andío', 'Παρακαλώ|Parakaló', 'Ευχαριστώ|Efcharistó', 'Ναι|Ne', 'Όχι|Óchi', 'Συγγνώμη|Signómi', 'Λυπάμαι|Lipáme', 'Δεν καταλαβαίνω|Den katalavéno', 'Μιλάτε αγγλικά;|Miláte angliká?', 'Πόσο κάνει;|Póso káni?', 'Πού είναι η τουαλέτα;|Pou íne i toualéta?',
    'Χάθηκα|Cháthika', 'Αριστερά|Aristerá', 'Δεξιά|Dexiá', 'Ευθεία|Efthía', 'Τον λογαριασμό, παρακαλώ|Ton logariasmó, parakaló', 'Νερό, παρακαλώ|Neró, parakaló', 'Είμαι χορτοφάγος|Íme chortofágos', 'Είμαι αλλεργικός στους ξηρούς καρπούς|Íme allergikós stous xiroús karpoús',
    'Βοήθεια!|Voíthia!', 'Καλέστε γιατρό!|Kaléste yiatró!', 'Καλέστε την αστυνομία!|Kaléste tin astinomía!'],
  'ένα|éna, δύο|dío, τρία|tría, τέσσερα|téssera, πέντε|pénde, έξι|éxi, επτά|eptá, οκτώ|októ, εννέα|ennéa, δέκα|déka'),
  lang('tr', 'Turkish', 'tr-TR', ['Merhaba', 'Hoşça kalın', 'Lütfen', 'Teşekkür ederim', 'Evet', 'Hayır', 'Affedersiniz', 'Özür dilerim', 'Anlamıyorum', 'İngilizce biliyor musunuz?', 'Ne kadar?', 'Tuvalet nerede?',
    'Kayboldum', 'Sola', 'Sağa', 'Dümdüz', 'Hesap, lütfen', 'Su, lütfen', 'Vejetaryenim', 'Kuruyemişe alerjim var',
    'İmdat!', 'Doktor çağırın!', 'Polis çağırın!'], 'bir, iki, üç, dört, beş, altı, yedi, sekiz, dokuz, on'),
  lang('ja', 'Japanese', 'ja-JP', ['こんにちは|Konnichiwa', 'さようなら|Sayōnara', 'お願いします|Onegai shimasu', 'ありがとうございます|Arigatō gozaimasu', 'はい|Hai', 'いいえ|Iie', 'すみません|Sumimasen', 'ごめんなさい|Gomen nasai', 'わかりません|Wakarimasen', '英語を話せますか？|Eigo o hanasemasu ka?', 'いくらですか？|Ikura desu ka?', 'トイレはどこですか？|Toire wa doko desu ka?',
    '道に迷いました|Michi ni mayoimashita', '左|Hidari', '右|Migi', 'まっすぐ|Massugu', 'お会計をお願いします|Okaikei o onegai shimasu', 'お水をください|Omizu o kudasai', 'ベジタリアンです|Bejitarian desu', 'ナッツのアレルギーがあります|Nattsu no arerugī ga arimasu',
    '助けて！|Tasukete!', '医者を呼んでください！|Isha o yonde kudasai!', '警察を呼んでください！|Keisatsu o yonde kudasai!'],
  '一|ichi, 二|ni, 三|san, 四|yon, 五|go, 六|roku, 七|nana, 八|hachi, 九|kyū, 十|jū'),
  lang('ko', 'Korean', 'ko-KR', ['안녕하세요|Annyeonghaseyo', '안녕히 계세요|Annyeonghi gyeseyo', '부탁합니다|Butakamnida', '감사합니다|Gamsahamnida', '네|Ne', '아니요|Aniyo', '실례합니다|Sillyehamnida', '죄송합니다|Joesonghamnida', '이해가 안 돼요|Ihaega an dwaeyo', '영어 하세요?|Yeongeo haseyo?', '얼마예요?|Eolmayeyo?', '화장실이 어디예요?|Hwajangsiri eodiyeyo?',
    '길을 잃었어요|Gireul ireosseoyo', '왼쪽|Oenjjok', '오른쪽|Oreunjjok', '직진|Jikjin', '계산서 주세요|Gyesanseo juseyo', '물 주세요|Mul juseyo', '저는 채식주의자예요|Jeoneun chaesikjuuijayeyo', '견과류 알레르기가 있어요|Gyeongwaryu allereugiga isseoyo',
    '도와주세요!|Dowajuseyo!', '의사를 불러 주세요!|Uisareul bulleo juseyo!', '경찰을 불러 주세요!|Gyeongchareul bulleo juseyo!'],
  '일|il, 이|i, 삼|sam, 사|sa, 오|o, 육|yuk, 칠|chil, 팔|pal, 구|gu, 십|sip'),
  lang('zh', 'Mandarin Chinese', 'zh-CN', ['你好|Nǐ hǎo', '再见|Zàijiàn', '请|Qǐng', '谢谢|Xièxie', '是|Shì', '不是|Bú shì', '打扰一下|Dǎrǎo yíxià', '对不起|Duìbuqǐ', '我听不懂|Wǒ tīng bù dǒng', '你会说英语吗？|Nǐ huì shuō Yīngyǔ ma?', '多少钱？|Duōshao qián?', '洗手间在哪里？|Xǐshǒujiān zài nǎlǐ?',
    '我迷路了|Wǒ mílù le', '左边|Zuǒbian', '右边|Yòubian', '一直走|Yìzhí zǒu', '买单|Mǎidān', '请给我水|Qǐng gěi wǒ shuǐ', '我吃素|Wǒ chī sù', '我对坚果过敏|Wǒ duì jiānguǒ guòmǐn',
    '救命！|Jiùmìng!', '请叫医生！|Qǐng jiào yīshēng!', '请叫警察！|Qǐng jiào jǐngchá!'],
  '一|yī, 二|èr, 三|sān, 四|sì, 五|wǔ, 六|liù, 七|qī, 八|bā, 九|jiǔ, 十|shí'),
  lang('th', 'Thai', 'th-TH', ['สวัสดีครับ / ค่ะ|Sawatdee khrap / kha', 'ลาก่อน|Laa gòn', 'กรุณา|Karunaa', 'ขอบคุณครับ / ค่ะ|Khop khun khrap / kha', 'ใช่|Chai', 'ไม่ใช่|Mai chai', 'ขอโทษครับ / ค่ะ|Khor thot khrap / kha', 'ขอโทษ|Khor thot', 'ไม่เข้าใจ|Mai khao jai', 'พูดภาษาอังกฤษได้ไหม|Phuut phaasaa angkrit dai mai?', 'เท่าไหร่|Thao rai?', 'ห้องน้ำอยู่ที่ไหน|Hong nam yuu thii nai?',
    'ฉันหลงทาง|Chan long thaang', 'ซ้าย|Saai', 'ขวา|Khwaa', 'ตรงไป|Trong pai', 'เช็คบิลด้วย|Check bin duay', 'ขอน้ำเปล่า|Khor nam plao', 'ฉันกินมังสวิรัติ|Chan gin mangsawirat', 'ฉันแพ้ถั่ว|Chan pae tua',
    'ช่วยด้วย|Chuay duay!', 'เรียกหมอให้หน่อย|Riak mor hai noi!', 'เรียกตำรวจให้หน่อย|Riak tamruat hai noi!'],
  'หนึ่ง|nueng, สอง|song, สาม|saam, สี่|sii, ห้า|haa, หก|hok, เจ็ด|jet, แปด|paet, เก้า|kao, สิบ|sip'),
  lang('vi', 'Vietnamese', 'vi-VN', ['Xin chào', 'Tạm biệt', 'Làm ơn', 'Cảm ơn', 'Vâng', 'Không', 'Xin lỗi', 'Tôi xin lỗi', 'Tôi không hiểu', 'Bạn có nói tiếng Anh không?', 'Bao nhiêu tiền?', 'Nhà vệ sinh ở đâu?',
    'Tôi bị lạc', 'Bên trái', 'Bên phải', 'Đi thẳng', 'Tính tiền', 'Cho tôi nước', 'Tôi ăn chay', 'Tôi bị dị ứng với các loại hạt',
    'Cứu tôi với!', 'Gọi bác sĩ!', 'Gọi công an!'], 'một, hai, ba, bốn, năm, sáu, bảy, tám, chín, mười'),
  lang('id', 'Indonesian', 'id-ID', ['Halo', 'Sampai jumpa', 'Tolong', 'Terima kasih', 'Ya', 'Tidak', 'Permisi', 'Maaf', 'Saya tidak mengerti', 'Bisa bahasa Inggris?', 'Berapa harganya?', 'Di mana toilet?',
    'Saya tersesat', 'Kiri', 'Kanan', 'Lurus', 'Minta bonnya', 'Minta air putih', 'Saya vegetarian', 'Saya alergi kacang',
    'Tolong!', 'Panggil dokter!', 'Panggil polisi!'], 'satu, dua, tiga, empat, lima, enam, tujuh, delapan, sembilan, sepuluh'),
  lang('ar', 'Arabic', 'ar-SA', ['مرحبا|Marhaban', 'مع السلامة|Maʿa as-salāma', 'من فضلك|Min faḍlak', 'شكرا|Shukran', 'نعم|Naʿam', 'لا|Lā', 'لو سمحت|Law samaḥt', 'آسف|Āsif', 'لا أفهم|Lā afham', 'هل تتكلم الإنجليزية؟|Hal tatakallam al-injlīziyya?', 'بكم هذا؟|Bikam hādhā?', 'أين الحمام؟|Ayna al-ḥammām?',
    'أنا تائه|Anā tāʾih', 'يسار|Yasār', 'يمين|Yamīn', 'على طول|ʿAla ṭūl', 'الحساب من فضلك|Al-ḥisāb min faḍlak', 'ماء من فضلك|Māʾ min faḍlak', 'أنا نباتي|Anā nabātī', 'عندي حساسية من المكسرات|ʿIndī ḥassāsiyya min al-mukassarāt',
    'النجدة!|An-najda!', 'اتصل بطبيب!|Ittaṣil bi-ṭabīb!', 'اتصل بالشرطة!|Ittaṣil bish-shurṭa!'],
  'واحد|wāḥid, اثنان|ithnān, ثلاثة|thalātha, أربعة|arbaʿa, خمسة|khamsa, ستة|sitta, سبعة|sabʿa, ثمانية|thamāniya, تسعة|tisʿa, عشرة|ʿashara', true),
  lang('hi', 'Hindi', 'hi-IN', ['नमस्ते|Namaste', 'फिर मिलेंगे|Phir milenge', 'कृपया|Kripya', 'धन्यवाद|Dhanyavaad', 'हाँ|Haan', 'नहीं|Nahin', 'माफ़ कीजिए|Maaf kijiye', 'क्षमा कीजिए|Kshama kijiye', 'मैं नहीं समझा / समझी|Main nahin samjha / samjhi', 'क्या आप अंग्रेज़ी बोलते हैं?|Kya aap angrezi bolte hain?', 'यह कितने का है?|Yeh kitne ka hai?', 'शौचालय कहाँ है?|Shauchalay kahaan hai?',
    'मैं रास्ता भूल गया / गई हूँ|Main raasta bhool gaya / gayi hoon', 'बाएँ|Baayen', 'दाएँ|Daayen', 'सीधे|Seedhe', 'बिल दीजिए|Bill dijiye', 'पानी दीजिए|Paani dijiye', 'मैं शाकाहारी हूँ|Main shaakaahaari hoon', 'मुझे मेवों से एलर्जी है|Mujhe mevon se allergy hai',
    'बचाओ!|Bachao!', 'डॉक्टर को बुलाइए!|Doctor ko bulaiye!', 'पुलिस को बुलाइए!|Police ko bulaiye!'],
  'एक|ek, दो|do, तीन|teen, चार|chaar, पाँच|paanch, छह|chhah, सात|saat, आठ|aath, नौ|nau, दस|das'),
  lang('ru', 'Russian', 'ru-RU', ['Здравствуйте|Zdravstvuyte', 'До свидания|Do svidaniya', 'Пожалуйста|Pozhaluysta', 'Спасибо|Spasibo', 'Да|Da', 'Нет|Net', 'Извините|Izvinite', 'Простите|Prostite', 'Я не понимаю|Ya ne ponimayu', 'Вы говорите по-английски?|Vy govorite po-angliyski?', 'Сколько это стоит?|Skolko eto stoit?', 'Где туалет?|Gde tualet?',
    'Я заблудился / заблудилась|Ya zabludilsya / zabludilas', 'Налево|Nalevo', 'Направо|Napravo', 'Прямо|Pryamo', 'Счёт, пожалуйста|Schyot, pozhaluysta', 'Воды, пожалуйста|Vody, pozhaluysta', 'Я вегетарианец / вегетарианка|Ya vegetarianets / vegetarianka', 'У меня аллергия на орехи|U menya allergiya na orekhi',
    'Помогите!|Pomogite!', 'Вызовите врача!|Vyzovite vracha!', 'Вызовите полицию!|Vyzovite politsiyu!'],
  'один|odin, два|dva, три|tri, четыре|chetyre, пять|pyat, шесть|shest, семь|sem, восемь|vosem, девять|devyat, десять|desyat'),
];

const BY_COUNTRY: Record<string, string> = {
  ES: 'es', MX: 'es-419', AR: 'es-419', CO: 'es-419', PE: 'es-419', CL: 'es-419', EC: 'es-419', BO: 'es-419', UY: 'es-419', PY: 'es-419', VE: 'es-419', CR: 'es-419', PA: 'es-419', GT: 'es-419', HN: 'es-419', SV: 'es-419', NI: 'es-419', DO: 'es-419', CU: 'es-419',
  FR: 'fr', MC: 'fr', LU: 'fr', BE: 'fr', SN: 'fr', CI: 'fr', DE: 'de', AT: 'de', CH: 'de', LI: 'de', IT: 'it', SM: 'it', VA: 'it', PT: 'pt', AO: 'pt', MZ: 'pt', CV: 'pt', BR: 'pt-BR', NL: 'nl', SR: 'nl',
  GR: 'el', CY: 'el', TR: 'tr', JP: 'ja', KR: 'ko', CN: 'zh', TH: 'th', VN: 'vi', ID: 'id', IN: 'hi', RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru',
  AE: 'ar', SA: 'ar', EG: 'ar', MA: 'ar', JO: 'ar', QA: 'ar', OM: 'ar', KW: 'ar', BH: 'ar', TN: 'ar', DZ: 'ar', LB: 'ar', IQ: 'ar', LY: 'ar', SD: 'ar', YE: 'ar', SY: 'ar', PS: 'ar',
};
/** Countries where English is the main language: no phrasebook needed. */
const ENGLISH = new Set(['GB', 'IE', 'US', 'CA', 'AU', 'NZ', 'JM', 'BS', 'BB', 'TT', 'BZ', 'GY', 'MT', 'SG', 'GH', 'NG', 'KE', 'UG', 'ZA', 'ZW', 'ZM', 'BW', 'NA', 'FJ']);

export const languageById = (id: string) => LANGUAGES.find((l) => l.id === id) ?? null;
/** The phrasebook for a country: its language, null when there's none here, 'english' where English does. */
export function languageFor(cc: string | null): Language | 'english' | null {
  if (!cc) return null;
  const c = cc.toUpperCase();
  if (ENGLISH.has(c)) return 'english';
  return languageById(BY_COUNTRY[c] ?? '') ?? null;
}

/** M253: "Please take me to this address", for the safety card's driver view, in every language above. */
export const TAKE_ME: Record<string, { text: string; say?: string }> = {
  es: { text: 'Por favor, lléveme a esta dirección.' }, 'es-419': { text: 'Por favor, lléveme a esta dirección.' },
  fr: { text: 'Pouvez-vous m’emmener à cette adresse, s’il vous plaît ?' }, de: { text: 'Bitte bringen Sie mich zu dieser Adresse.' },
  it: { text: 'Mi porti a questo indirizzo, per favore.' }, pt: { text: 'Leve-me a esta morada, por favor.' }, 'pt-BR': { text: 'Por favor, me leve a este endereço.' },
  nl: { text: 'Wilt u mij naar dit adres brengen, alstublieft?' },
  el: { text: 'Παρακαλώ, πηγαίνετέ με σε αυτή τη διεύθυνση.', say: 'Parakaló, pigénete me se aftí ti diéfthinsi.' },
  tr: { text: 'Lütfen beni bu adrese götürün.' },
  ja: { text: 'この住所までお願いします。', say: 'Kono jūsho made onegai shimasu.' },
  ko: { text: '이 주소로 가 주세요.', say: 'I jusoro ga juseyo.' },
  zh: { text: '请带我去这个地址。', say: 'Qǐng dài wǒ qù zhège dìzhǐ.' },
  th: { text: 'กรุณาพาไปที่อยู่นี้', say: 'Karunaa phaa pai thii yuu nii.' },
  vi: { text: 'Làm ơn đưa tôi đến địa chỉ này.' }, id: { text: 'Tolong antar saya ke alamat ini.' },
  ar: { text: 'من فضلك خذني إلى هذا العنوان.', say: 'Min faḍlak khudhnī ilā hādhā al-ʿunwān.' },
  hi: { text: 'कृपया मुझे इस पते पर ले चलिए।', say: 'Kripya mujhe is pate par le chaliye.' },
  ru: { text: 'Отвезите меня, пожалуйста, по этому адресу.', say: 'Otvezite menya, pozhaluysta, po etomu adresu.' },
};
