/* accents.js — primitivas de acentos (desenhados ACIMA do cap line, y < 0)
   e tabela de decomposição para Latin-1 Supplement. */
(function (global) {
  const MID = 2.5;
  const L = (ax, ay, bx, by) => ({ type: 'line', a: [ax, ay], b: [bx, by] });
  const A = (cx, cy, r, a0, a1) => ({ type: 'arc', c: [cx, cy], r, a0, a1 });

  // Acentos posicionados acima de y=0 (cap top). Centro em x=MID.
  const ACCENTS = {
    acute:      [L(MID - 0.6, -0.4, MID + 0.6, -1.3)],
    grave:      [L(MID - 0.6, -1.3, MID + 0.6, -0.4)],
    circumflex: [L(MID - 0.8, -0.4, MID, -1.3), L(MID, -1.3, MID + 0.8, -0.4)],
    tilde:      [L(MID - 1, -0.6, MID - 0.3, -1.1), L(MID - 0.3, -1.1, MID + 0.3, -0.6), L(MID + 0.3, -0.6, MID + 1, -1.1)],
    diaeresis:  [A(MID - 0.6, -0.9, 0.25, 0, 360), A(MID + 0.6, -0.9, 0.25, 0, 360)],
    ring:       [A(MID, -1.0, 0.45, 0, 360)],
    macron:     [L(MID - 0.8, -0.9, MID + 0.8, -0.9)],
    caron:      [L(MID - 0.8, -1.3, MID, -0.4), L(MID, -0.4, MID + 0.8, -1.3)],
    breve:      [A(MID, -0.7, 0.7, 30, 150)],
    dotabove:   [A(MID, -0.9, 0.25, 0, 360)],
    cedilla:    [L(MID, 7, MID - 0.2, 7.4), L(MID - 0.2, 7.4, MID + 0.3, 7.8)],
    ogonek:     [L(MID + 0.5, 7, MID + 0.1, 7.7)],
    stroke:     [L(0.5, 4.5, 4.5, 2.5)],   // barra diagonal para Ø, ø, etc.
  };

  // Decomposição: char -> { base: 'A', accents: ['acute'] } ou { custom: [...primitivas] }
  const DECOMP = {
    'À':{base:'A',acc:['grave']}, 'Á':{base:'A',acc:['acute']}, 'Â':{base:'A',acc:['circumflex']},
    'Ã':{base:'A',acc:['tilde']}, 'Ä':{base:'A',acc:['diaeresis']}, 'Å':{base:'A',acc:['ring']},
    'Ç':{base:'C',acc:['cedilla']},
    'È':{base:'E',acc:['grave']}, 'É':{base:'E',acc:['acute']}, 'Ê':{base:'E',acc:['circumflex']}, 'Ë':{base:'E',acc:['diaeresis']},
    'Ì':{base:'I',acc:['grave']}, 'Í':{base:'I',acc:['acute']}, 'Î':{base:'I',acc:['circumflex']}, 'Ï':{base:'I',acc:['diaeresis']},
    'Ñ':{base:'N',acc:['tilde']},
    'Ò':{base:'O',acc:['grave']}, 'Ó':{base:'O',acc:['acute']}, 'Ô':{base:'O',acc:['circumflex']}, 'Õ':{base:'O',acc:['tilde']}, 'Ö':{base:'O',acc:['diaeresis']},
    'Ø':{base:'O',acc:['stroke']},
    'Ù':{base:'U',acc:['grave']}, 'Ú':{base:'U',acc:['acute']}, 'Û':{base:'U',acc:['circumflex']}, 'Ü':{base:'U',acc:['diaeresis']},
    'Ý':{base:'Y',acc:['acute']}, 'Ÿ':{base:'Y',acc:['diaeresis']},

    'à':{base:'a',acc:['grave']}, 'á':{base:'a',acc:['acute']}, 'â':{base:'a',acc:['circumflex']},
    'ã':{base:'a',acc:['tilde']}, 'ä':{base:'a',acc:['diaeresis']}, 'å':{base:'a',acc:['ring']},
    'ç':{base:'c',acc:['cedilla']},
    'è':{base:'e',acc:['grave']}, 'é':{base:'e',acc:['acute']}, 'ê':{base:'e',acc:['circumflex']}, 'ë':{base:'e',acc:['diaeresis']},
    'ì':{base:'i',acc:['grave']}, 'í':{base:'i',acc:['acute']}, 'î':{base:'i',acc:['circumflex']}, 'ï':{base:'i',acc:['diaeresis']},
    'ñ':{base:'n',acc:['tilde']},
    'ò':{base:'o',acc:['grave']}, 'ó':{base:'o',acc:['acute']}, 'ô':{base:'o',acc:['circumflex']}, 'õ':{base:'o',acc:['tilde']}, 'ö':{base:'o',acc:['diaeresis']},
    'ø':{base:'o',acc:['stroke']},
    'ù':{base:'u',acc:['grave']}, 'ú':{base:'u',acc:['acute']}, 'û':{base:'u',acc:['circumflex']}, 'ü':{base:'u',acc:['diaeresis']},
    'ý':{base:'y',acc:['acute']}, 'ÿ':{base:'y',acc:['diaeresis']},
  };

  function getAccent(name) { return ACCENTS[name] || []; }
  function decompose(ch) { return DECOMP[ch] || null; }

  global.TG.accents = { ACCENTS, DECOMP, getAccent, decompose };
})(window);
