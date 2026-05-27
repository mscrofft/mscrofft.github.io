// Sequenciador de word chart por ponto. Cada função recebe (cells, cols, rows)
// e retorna uma lista de fileiras de execução: [{label, beads: [{idx, count}]}].
// `idx` é o índice em Grid.swatchMap; células vazias (-1) são puladas.

const Sequencer = {
  // Peyote par (flat even-count): cada grid row r >= 1 contém duas sub-fileiras
  // de execução, uma com colunas ímpares (R→L) e outra com colunas pares (L→R).
  'peyote-even'(cells, cols, rows) {
    const out = [];
    // Fileiras 1 & 2 combinadas: linha 0 esquerda→direita (todas as colunas)
    out.push({
      label: `${t('seqRow')} 1 & 2`,
      beads: compact(rowBeads(cells, 0, cols, false))
    });
    let fileira = 3;
    for (let r = 1; r < rows; r++) {
      // Sub-fileira ímpar de execução: cols ímpares (1, 3, 5...) R→L
      const oddSeq = [];
      for (let c = cols - 1; c >= 0; c--) if (c % 2 === 1) oddSeq.push(cells[r][c]);
      out.push({ label: `${t('seqRow')} ${fileira++}`, beads: compact(oddSeq) });
      // Sub-fileira par de execução: cols pares (0, 2, 4...) L→R
      const evenSeq = [];
      for (let c = 0; c < cols; c++) if (c % 2 === 0) evenSeq.push(cells[r][c]);
      out.push({ label: `${t('seqRow')} ${fileira++}`, beads: compact(evenSeq) });
    }
    return out;
  },

  // Peyote ímpar (flat odd-count): TODO — implementar a lógica com turn-around.
  // Placeholder: usa a mesma sequência do peyote par; em odd-count haveria um
  // ajuste no fim de fileiras pares (passagem extra para virar).
  'peyote-odd'(cells, cols, rows) {
    return Sequencer['peyote-even'](cells, cols, rows);
  },

  // Alias para retro-compatibilidade
  peyote(cells, cols, rows) {
    return Sequencer['peyote-even'](cells, cols, rows);
  },

  // Brick: fileira 1 = ladder (linha 0). Demais alternam direção.
  brick(cells, cols, rows) {
    const out = [];
    out.push({ label: `${t('seqRow')} 1`, beads: compact(rowBeads(cells, 0, cols, false)) });
    for (let r = 1; r < rows; r++) {
      const reverse = (r % 2) === 1; // alterna
      out.push({ label: `${t('seqRow')} ${r + 1}`, beads: compact(rowBeads(cells, r, cols, reverse)) });
    }
    return out;
  },

  // Square / Loom: linhas retas, alternando direção.
  square(cells, cols, rows) {
    const out = [];
    for (let r = 0; r < rows; r++) {
      const reverse = (r % 2) === 1;
      out.push({ label: `${t('seqRow')} ${r + 1}`, beads: compact(rowBeads(cells, r, cols, reverse)) });
    }
    return out;
  },

  // Herringbone: cada linha do grid contém pares (col 0+1, 2+3, ...).
  // Emite pares na ordem da fileira, alternando direção entre fileiras.
  herringbone(cells, cols, rows) {
    const out = [];
    for (let r = 0; r < rows; r++) {
      const pairs = [];
      const pairCount = Math.floor(cols / 2);
      for (let p = 0; p < pairCount; p++) {
        pairs.push(cells[r][p * 2], cells[r][p * 2 + 1]);
      }
      // se cols ímpar, anexa último
      if (cols % 2 === 1) pairs.push(cells[r][cols - 1]);
      const seq = (r % 2 === 1) ? pairs.slice().reverse() : pairs;
      out.push({ label: `${t('seqRow')} ${r + 1}`, beads: compact(seq) });
    }
    return out;
  },

  // Embroidery: linha-a-linha esquerda→direita (sem alternar).
  embroidery(cells, cols, rows) {
    const out = [];
    for (let r = 0; r < rows; r++) {
      out.push({ label: `${t('seqRow')} ${r + 1}`, beads: compact(rowBeads(cells, r, cols, false)) });
    }
    return out;
  },

  // Contorno: sequência reta esquerda→direita, linha-a-linha (placeholder; v1).
  contour(cells, cols, rows) {
    return Sequencer.embroidery(cells, cols, rows);
  }
};

// Retorna a ordem de execução das células como array de {r, c}, na ordem que a
// artesã colocaria as miçangas. Usado para numerar cada miçanga no grid.
const BeadOrder = {
  'peyote-even'(cols, rows) {
    const out = [];
    for (let c = 0; c < cols; c++) out.push({ r: 0, c });
    for (let r = 1; r < rows; r++) {
      for (let c = cols - 1; c >= 0; c--) if (c % 2 === 1) out.push({ r, c });
      for (let c = 0; c < cols; c++) if (c % 2 === 0) out.push({ r, c });
    }
    return out;
  },
  'peyote-odd'(cols, rows) { return BeadOrder['peyote-even'](cols, rows); },
  peyote(cols, rows) { return BeadOrder['peyote-even'](cols, rows); },
  brick(cols, rows) {
    const out = [];
    for (let c = 0; c < cols; c++) out.push({ r: 0, c });
    for (let r = 1; r < rows; r++) {
      const rev = (r % 2) === 1;
      if (rev) for (let c = cols - 1; c >= 0; c--) out.push({ r, c });
      else for (let c = 0; c < cols; c++) out.push({ r, c });
    }
    return out;
  },
  square(cols, rows) {
    const out = [];
    for (let r = 0; r < rows; r++) {
      const rev = (r % 2) === 1;
      if (rev) for (let c = cols - 1; c >= 0; c--) out.push({ r, c });
      else for (let c = 0; c < cols; c++) out.push({ r, c });
    }
    return out;
  },
  herringbone(cols, rows) {
    const out = [];
    for (let r = 0; r < rows; r++) {
      const seq = [];
      const pairs = Math.floor(cols / 2);
      for (let p = 0; p < pairs; p++) { seq.push({ r, c: p * 2 }); seq.push({ r, c: p * 2 + 1 }); }
      if (cols % 2 === 1) seq.push({ r, c: cols - 1 });
      if (r % 2 === 1) seq.reverse();
      out.push(...seq);
    }
    return out;
  },
  embroidery(cols, rows) {
    const out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ r, c });
    return out;
  },
  contour(cols, rows) { return BeadOrder.embroidery(cols, rows); }
};

// Devolve um mapa rows×cols com o número de cada miçanga (1-based)
function beadNumberMap(stitch, cols, rows) {
  const order = (BeadOrder[stitch] || BeadOrder.embroidery)(cols, rows);
  const map = Array.from({ length: rows }, () => Array(cols).fill(0));
  order.forEach((p, i) => { map[p.r][p.c] = i + 1; });
  return map;
}

function rowBeads(cells, r, cols, reverse) {
  const seq = [];
  for (let c = 0; c < cols; c++) seq.push(cells[r][c]);
  return reverse ? seq.reverse() : seq;
}

// Compacta sequência de índices em segmentos {idx, count}, pulando vazios (-1).
function compact(seq) {
  const out = [];
  let cur = null, count = 0;
  for (const v of seq) {
    if (v === cur) count++;
    else {
      if (cur !== null) out.push({ idx: cur, count });
      cur = v; count = 1;
    }
  }
  if (cur !== null) out.push({ idx: cur, count });
  return out.filter(s => s.idx >= 0);
}
