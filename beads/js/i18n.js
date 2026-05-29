const I18N = {
  pt: {
    appTitle: "BEAD PATTERN GENERATOR",
    stitch: "Ponto:", new: "Novo", importImg: "Importar Imagem",
    save: "Salvar", open: "Abrir", exportPng: "PNG", exportPdf: "PDF A4",
    peyote: "Peyote", peyoteEven: "Peyote Par", peyoteOdd: "Peyote Ímpar",
    brick: "Tijolo", herringbone: "Espinha de Peixe",
    square: "Quadrado", embroidery: "Costura (Embroidery)", contour: "Contorno",
    tools: "Ferramentas", brush: "Pincel", bucket: "Balde", eraser: "Borracha",
    picker: "Conta-gotas", line: "Linha", rect: "Retângulo",
    zoom: "Zoom", clear: "Limpar", showNumbers: "Mostrar números",
    brushSize: "Tamanho do pincel",
    login: "Login", logout: "Sair", enterEmail: "E-mail:",
    loginHint: "Digite seu e-mail e enviaremos um link mágico para entrar.",
    sendLink: "Enviar link", linkSent: "Link enviado! Confira sua caixa de entrada.",
    saveCloud: "☁ Salvar", myPatterns: "Meus padrões",
    untitled: "Sem título", confirmDelete: "Excluir este padrão?",
    noPatterns: "Nenhum padrão salvo ainda.",
    presetLabel: "Preset", presetNone: "— escolher —",
    presetRandomUniform: "Aleatório uniforme", presetRandomWeighted: "Aleatório ponderado",
    presetStripesH: "Listras horizontais", presetStripesV: "Listras verticais",
    presetDiagSlash: "Diagonais /", presetDiagBack: "Diagonais \\",
    presetChecker: "Xadrez", presetDiamond: "Losango",
    presetDiamondsTiled: "Losangos (harlequim)", presetSquaresTiled: "Quadrados tiled",
    presetWaves: "Ondas",
    presetGradientH: "Gradiente horizontal", presetGradientV: "Gradiente vertical",
    paramWidth: "Largura", paramSize: "Tamanho", paramAmp: "Amplitude",
    paramPeriod: "Período", paramThickness: "Espessura", paramGap: "Espaçamento",
    palette: "Paleta", miyuki: "Miyuki Delica", toho: "Toho Round", custom: "Personalizada",
    usedColors: "Cores usadas", addColor: "+ cor",
    pruneUnused: "Limpar não usadas", reduceColors: "Reduzir cores...",
    howManyColors: "Reduzir para quantas cores?",
    newPattern: "Novo padrão", width: "Largura (miçangas):", height: "Altura (linhas):",
    cancel: "Cancelar", create: "Criar", numColors: "Nº de cores:", apply: "Aplicar",
    lockRatio: "Manter proporção da imagem",
    title: "Título:", author: "Autora:",
    includeLegend: "Incluir legenda de cores", includeWordchart: "Incluir word chart",
    labelMode: "Identificação das cores:", labelName: "Só nome", labelCode: "Só código", labelBoth: "Nome + código",
    generate: "Gerar PDF",
    confirmNew: "Descartar o padrão atual?",
    row: "Linha", seqRow: "Fileira", beads: "miçangas", total: "Total",
    colorLegend: "Legenda de cores", wordChart: "Word chart"
  },
  en: {
    appTitle: "BEAD PATTERN GENERATOR",
    stitch: "Stitch:", new: "New", importImg: "Import Image",
    save: "Save", open: "Open", exportPng: "PNG", exportPdf: "PDF A4",
    peyote: "Peyote", peyoteEven: "Even-count Peyote", peyoteOdd: "Odd-count Peyote",
    brick: "Brick", herringbone: "Herringbone",
    square: "Square", embroidery: "Embroidery", contour: "Contour",
    tools: "Tools", brush: "Brush", bucket: "Bucket", eraser: "Eraser",
    picker: "Eyedropper", line: "Line", rect: "Rectangle",
    zoom: "Zoom", clear: "Clear", showNumbers: "Show numbers",
    brushSize: "Brush size",
    login: "Login", logout: "Sign out", enterEmail: "E-mail:",
    loginHint: "Enter your email and we'll send a magic link to sign in.",
    sendLink: "Send link", linkSent: "Link sent! Check your inbox.",
    saveCloud: "☁ Save", myPatterns: "My patterns",
    untitled: "Untitled", confirmDelete: "Delete this pattern?",
    noPatterns: "No saved patterns yet.",
    presetLabel: "Preset", presetNone: "— choose —",
    presetRandomUniform: "Random uniform", presetRandomWeighted: "Random weighted",
    presetStripesH: "Horizontal stripes", presetStripesV: "Vertical stripes",
    presetDiagSlash: "Diagonals /", presetDiagBack: "Diagonals \\",
    presetChecker: "Checker", presetDiamond: "Diamond",
    presetDiamondsTiled: "Diamonds (harlequin)", presetSquaresTiled: "Squares tiled",
    presetWaves: "Waves",
    presetGradientH: "Horizontal gradient", presetGradientV: "Vertical gradient",
    paramWidth: "Width", paramSize: "Size", paramAmp: "Amplitude",
    paramPeriod: "Period", paramThickness: "Thickness", paramGap: "Gap",
    palette: "Palette", miyuki: "Miyuki Delica", toho: "Toho Round", custom: "Custom",
    usedColors: "Used colors", addColor: "+ color",
    pruneUnused: "Remove unused", reduceColors: "Reduce colors...",
    howManyColors: "Reduce to how many colors?",
    newPattern: "New pattern", width: "Width (beads):", height: "Height (rows):",
    cancel: "Cancel", create: "Create", numColors: "Number of colors:", apply: "Apply",
    lockRatio: "Lock image aspect ratio",
    title: "Title:", author: "Author:",
    includeLegend: "Include color legend", includeWordchart: "Include word chart",
    labelMode: "Color label:", labelName: "Name only", labelCode: "Code only", labelBoth: "Name + code",
    generate: "Generate PDF",
    confirmNew: "Discard current pattern?",
    row: "Row", seqRow: "Row", beads: "beads", total: "Total",
    colorLegend: "Color legend", wordChart: "Word chart"
  }
};

let currentLang = localStorage.getItem('beads-lang') || localStorage.getItem('beeds-lang') || 'pt';

function t(key) { return (I18N[currentLang] && I18N[currentLang][key]) || key; }

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (el.tagName === 'INPUT' && el.placeholder !== undefined && el.type === 'text') el.placeholder = val;
    else el.textContent = val;
  });
  document.documentElement.lang = currentLang === 'pt' ? 'pt-BR' : 'en';
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('beads-lang', lang);
  applyI18n();
}
