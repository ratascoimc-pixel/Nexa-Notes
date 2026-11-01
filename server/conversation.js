export function conversationTurns(result) {
  if (!Array.isArray(result?.segments)) throw new Error('Speaker separation was not returned.');
  const labels = new Map();
  const turns = result.segments.filter(s => typeof s.text === 'string' && s.text.trim()).map(s => {
    if (typeof s.speaker !== 'string' || !s.speaker.trim() || !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end < s.start) throw new Error('Invalid speaker segment.');
    if (!labels.has(s.speaker)) labels.set(s.speaker, `Speaker ${labels.size+1}`);
    return {speaker:labels.get(s.speaker),start:s.start,end:s.end,text:s.text.trim()};
  });
  if (!turns.length) throw new Error('No speech detected.');
  return turns;
}
