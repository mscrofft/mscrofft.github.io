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
    palette: "Paleta", miyuki: "Miyuki Delica", toho: "Toho Round", custom: "Personalizada",
    usedColors: "Cores usadas", addColor: "+ cor",
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
    palette: "Palette", miyuki: "Miyuki Delica", toho: "Toho Round", custom: "Custom",
    usedColors: "Used colors", addColor: "+ color",
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
