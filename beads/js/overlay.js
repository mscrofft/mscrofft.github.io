// Imagem de referência: overlay translúcido sobre o grid pra tracing.
// Modos: 'view' (locked, paint passes through), 'edit' (drag + resize), 'crop' (marquee).

const Overlay = {
  image: null,            // HTMLImageElement
  transform: { x: 0, y: 0, width: 200, height: 200 },
  opacity: 0.5,
  mode: 'view',
  cropRect: null,         // { x, y, w, h } em px do container

  load(file, onReady) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        this.image = img;
        // Centraliza no canvas-area, escala pra caber em até 80% da área visível
        const area = document.querySelector('.canvas-area');
        const aw = area.clientWidth, ah = area.clientHeight;
        const ratio = Math.min((aw * 0.8) / img.width, (ah * 0.8) / img.height, 1);
        this.transform.width = Math.round(img.width * ratio);
        this.transform.height = Math.round(img.height * ratio);
        this.transform.x = Math.round((aw - this.transform.width) / 2) + area.scrollLeft;
        this.transform.y = Math.round((ah - this.transform.height) / 2) + area.scrollTop;
        this.show();
        this.applyTransform();
        this.setOpacity(this.opacity);
        if (onReady) onReady();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  show() {
    document.getElementById('overlay-container').classList.remove('overlay-hidden');
    document.getElementById('overlay-img').src = this.image.src;
    document.getElementById('overlay-controls').classList.remove('hidden');
    document.getElementById('btn-overlay-import').textContent = 'Trocar imagem...';
  },

  clear() {
    this.image = null;
    this.mode = 'view';
    document.getElementById('overlay-container').classList.add('overlay-hidden');
    document.getElementById('overlay-controls').classList.add('hidden');
    document.getElementById('btn-overlay-import').textContent = 'Importar imagem...';
    this.cancelCrop();
  },

  setOpacity(v) {
    this.opacity = v;
    const img = document.getElementById('overlay-img');
    if (img) img.style.opacity = v;
  },

  setMode(mode) {
    this.mode = mode;
    const container = document.getElementById('overlay-container');
    container.classList.toggle('editing', mode === 'edit');
    container.classList.toggle('cropping', mode === 'crop');
    document.getElementById('btn-overlay-edit').classList.toggle('active', mode === 'edit');
    document.getElementById('btn-overlay-crop').classList.toggle('active', mode === 'crop');
  },

  applyTransform() {
    const c = document.getElementById('overlay-container');
    c.style.left = this.transform.x + 'px';
    c.style.top = this.transform.y + 'px';
    c.style.width = this.transform.width + 'px';
    c.style.height = this.transform.height + 'px';
  },

  startCrop() {
    if (!this.image) return;
    this.setMode('crop');
    // Crop inicial: 80% da imagem centralizada (em px do container, que = transform.width/height)
    const w = this.transform.width, h = this.transform.height;
    this.cropRect = {
      x: Math.round(w * 0.1), y: Math.round(h * 0.1),
      w: Math.round(w * 0.8), h: Math.round(h * 0.8)
    };
    this.renderCropRect();
    document.getElementById('overlay-crop-rect').classList.remove('hidden');
    document.getElementById('overlay-crop-actions').classList.remove('hidden');
    document.querySelector('.overlay-actions').classList.add('hidden');
  },

  renderCropRect() {
    if (!this.cropRect) return;
    const r = document.getElementById('overlay-crop-rect');
    r.style.left = this.cropRect.x + 'px';
    r.style.top = this.cropRect.y + 'px';
    r.style.width = this.cropRect.w + 'px';
    r.style.height = this.cropRect.h + 'px';
  },

  cancelCrop() {
    this.cropRect = null;
    document.getElementById('overlay-crop-rect').classList.add('hidden');
    document.getElementById('overlay-crop-actions').classList.add('hidden');
    document.querySelector('.overlay-actions').classList.remove('hidden');
    if (this.mode === 'crop') this.setMode('edit');
  },

  // Recorta a imagem usando cropRect (em px do container) → cria nova imagem.
  // Retorna a proporção do crop (w/h) pra modal sugerir novas dimensões.
  applyCrop() {
    if (!this.image || !this.cropRect) return null;
    // Mapeia px do container → px da imagem original
    const scaleX = this.image.width / this.transform.width;
    const scaleY = this.image.height / this.transform.height;
    const sx = Math.max(0, this.cropRect.x * scaleX);
    const sy = Math.max(0, this.cropRect.y * scaleY);
    const sw = Math.min(this.image.width - sx, this.cropRect.w * scaleX);
    const sh = Math.min(this.image.height - sy, this.cropRect.h * scaleY);

    const tmp = document.createElement('canvas');
    tmp.width = Math.round(sw);
    tmp.height = Math.round(sh);
    const ctx = tmp.getContext('2d');
    ctx.drawImage(this.image, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);

    const newImg = new Image();
    return new Promise(resolve => {
      newImg.onload = () => {
        this.image = newImg;
        this.transform.width = this.cropRect.w;
        this.transform.height = this.cropRect.h;
        // Posiciona onde o cropRect estava
        const c = document.getElementById('overlay-container');
        const curLeft = parseInt(c.style.left || 0, 10);
        const curTop = parseInt(c.style.top || 0, 10);
        this.transform.x = curLeft + this.cropRect.x;
        this.transform.y = curTop + this.cropRect.y;
        document.getElementById('overlay-img').src = newImg.src;
        this.applyTransform();
        this.cancelCrop();
        resolve({ width: tmp.width, height: tmp.height, aspect: tmp.width / tmp.height });
      };
      newImg.src = tmp.toDataURL('image/png');
    });
  }
};
