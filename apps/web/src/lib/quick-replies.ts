// M340 (the owner, 19 Nov: Messages' quick replies): one-tap answers under the last message someone else sent,
// picked by plain rules from what it says (free: no AI, nothing leaves the browser). Three at most, in the chat's
// own words where it can (a question gets yes / no, thanks gets "you're welcome", a plan gets "see you then").

const has = (text: string, ...words: string[]) => words.some((w) => new RegExp(`(^|[^\\p{L}])${w}`, 'iu').test(text));

/** Up to three short replies to `text` (the last message from someone else); none for an empty or very long one. */
export function quickReplies(text: string): string[] {
  const t = text.trim();
  if (!t || t.length > 600) return [];
  const plan = has(t, 'meet', 'call', 'tomorrow', 'tonight', 'today at', 'at \\d', 'class', 'lecture', 'lunch', 'coffee', 'see you');
  if (has(t, 'how are you', 'how r u', 'how’s it going', "how's it going")) return ['Good, thanks! You?', 'All good 🙂', 'Busy but fine'];
  if (t.endsWith('?')) {
    if (has(t, 'when', 'what time')) return ['Now works', 'Later today?', 'Tomorrow?'];
    if (has(t, 'where')) return ['Same place as usual', 'I’ll send the location', 'Not sure yet'];
    if (has(t, 'can you', 'could you', 'would you', 'will you')) return ['Sure!', 'Yes, on it', 'Sorry, I can’t'];
    if (plan) return ['Yes, works for me', 'Can we move it?', 'Can’t make it'];
    return ['Yes', 'No', 'Not sure yet'];
  }
  if (has(t, 'thank', 'thx', 'merci', 'gracias', 'shukriya', 'dhanyavaad')) return ['You’re welcome!', 'Any time 🙂', '👍'];
  if (has(t, 'sorry', 'apolog')) return ['No worries', 'All good 🙂', 'Thanks for saying'];
  if (has(t, 'congrat', 'well done', 'great job', 'passed', 'got the job', 'won')) return ['Thank you! 🎉', 'Thanks so much', '🙌'];
  if (has(t, 'happy birthday', 'bday')) return ['Thank you! 🎂', 'Thanks so much!', '🥳'];
  if (has(t, 'good morning')) return ['Good morning!', 'Morning ☀️', '👋'];
  if (has(t, 'good night', 'gn')) return ['Good night!', 'Sleep well 🌙', '👋'];
  if (has(t, 'hi', 'hey', 'hello', 'hiya', 'namaste', 'bonjour', 'hola') && t.length < 30) return ['Hi! 👋', 'Hey, how are you?', 'Hello!'];
  if (plan) return ['Sounds good 👍', 'See you then', 'On my way'];
  if (has(t, 'urgent', 'asap', 'now please', 'emergency')) return ['On it', 'Calling you now', 'Give me 5 min'];
  return ['👍', 'Got it', 'Thanks!'];
}
