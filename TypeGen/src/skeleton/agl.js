/* agl.js — Adobe Glyph List parcial (forward + reverse).
   Usado em exportFont (nome dos glyphs no OTF) e em svgImport (resolver
   nomes de arquivos como 'Glyph_period.svg' para o caractere '.'). */
(function (global) {
  const FORWARD = {
    ' ': 'space',
    '!': 'exclam', '"': 'quotedbl', '#': 'numbersign', '$': 'dollar',
    '%': 'percent', '&': 'ampersand', "'": 'quotesingle', '(': 'parenleft',
    ')': 'parenright', '*': 'asterisk', '+': 'plus', ',': 'comma', '-': 'hyphen',
    '.': 'period', '/': 'slash',
    '0':'zero','1':'one','2':'two','3':'three','4':'four','5':'five','6':'six','7':'seven','8':'eight','9':'nine',
    ':': 'colon', ';': 'semicolon', '<': 'less', '=': 'equal', '>': 'greater', '?': 'question', '@': 'at',
    '[': 'bracketleft', '\\': 'backslash', ']': 'bracketright', '^': 'asciicircum', '_': 'underscore',
    '`': 'grave', '{': 'braceleft', '|': 'bar', '}': 'braceright', '~': 'asciitilde',
    // Latin-1 acentuados (mais usados em português)
    'Á':'Aacute','À':'Agrave','Â':'Acircumflex','Ã':'Atilde','Ä':'Adieresis','Å':'Aring',
    'á':'aacute','à':'agrave','â':'acircumflex','ã':'atilde','ä':'adieresis','å':'aring',
    'Ç':'Ccedilla','ç':'ccedilla',
    'É':'Eacute','È':'Egrave','Ê':'Ecircumflex','Ë':'Edieresis',
    'é':'eacute','è':'egrave','ê':'ecircumflex','ë':'edieresis',
    'Í':'Iacute','Ì':'Igrave','Î':'Icircumflex','Ï':'Idieresis',
    'í':'iacute','ì':'igrave','î':'icircumflex','ï':'idieresis',
    'Ñ':'Ntilde','ñ':'ntilde',
    'Ó':'Oacute','Ò':'Ograve','Ô':'Ocircumflex','Õ':'Otilde','Ö':'Odieresis','Ø':'Oslash',
    'ó':'oacute','ò':'ograve','ô':'ocircumflex','õ':'otilde','ö':'odieresis','ø':'oslash',
    'Ú':'Uacute','Ù':'Ugrave','Û':'Ucircumflex','Ü':'Udieresis',
    'ú':'uacute','ù':'ugrave','û':'ucircumflex','ü':'udieresis',
    'Ý':'Yacute','Ÿ':'Ydieresis','ý':'yacute','ÿ':'ydieresis',
    'ß':'germandbls','¡':'exclamdown','¿':'questiondown',
    '«':'guillemotleft','»':'guillemotright','‹':'guilsinglleft','›':'guilsinglright',
    '©':'copyright','®':'registered','°':'degree','±':'plusminus','·':'periodcentered',
    '×':'multiply','÷':'divide','¶':'paragraph','§':'section','µ':'mu',
    '€':'Euro','£':'sterling','¥':'yen','¢':'cent', '¦':'brokenbar', '¨':'dieresis', '¬':'logicalnot',
    '¯':'macron','´':'acute','¸':'cedilla','ª':'ordfeminine','º':'ordmasculine',
  };

  const REVERSE = {};
  for (const ch of Object.keys(FORWARD)) REVERSE[FORWARD[ch]] = ch;
  // adicionais úteis: nomes alternativos
  REVERSE['nbspace'] = ' ';
  REVERSE['hyphenminus'] = '-';

  function forName(ch) {
    if (/[A-Za-z]/.test(ch)) return ch;
    if (FORWARD[ch]) return FORWARD[ch];
    return 'uni' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
  }
  function fromName(name) {
    if (!name) return null;
    if (name.length === 1) return name;
    if (REVERSE[name]) return REVERSE[name];
    // formato 'uniXXXX'
    const m = name.match(/^uni([0-9A-Fa-f]{4,6})$/);
    if (m) return String.fromCodePoint(parseInt(m[1], 16));
    return null;
  }

  global.TG = global.TG || {};
  global.TG.agl = { FORWARD, REVERSE, forName, fromName };
})(window);
