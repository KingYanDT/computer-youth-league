function normalizeOriginalName(originalName) {
  if (!originalName) return originalName;

  // Some multipart parsers expose UTF-8 filenames as latin1 mojibake
  // or Windows-1252 mojibake, e.g. "æ–°å»º æ–‡æœ¬æ–‡æ¡£.txt".
  const looksMojibake = /[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßà-ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/.test(originalName);
  if (!looksMojibake) return originalName;

  const decoded = Buffer.from(toWindows1252Bytes(originalName)).toString('utf8');
  if (!decoded || decoded.includes('\uFFFD')) return originalName;

  return decoded;
}

function toWindows1252Bytes(value) {
  const bytes = [];
  for (const char of value) {
    const code = char.codePointAt(0);
    bytes.push(WINDOWS_1252_REVERSE[code] || (code <= 0xff ? code : 0x3f));
  }
  return bytes;
}

const WINDOWS_1252_REVERSE = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f
};

module.exports = { normalizeOriginalName };
