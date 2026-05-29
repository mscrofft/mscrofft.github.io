// Integração com Supabase: auth (magic link) + CRUD de patterns.

const Cloud = {
  client: null,
  user: null,
  _authListeners: [],

  init() {
    if (!window.supabase || !SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
      console.warn('[Cloud] Supabase não configurado. Edite js/config.js.');
      return false;
    }
    this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // Recupera sessão atual
    this.client.auth.getSession().then(({ data }) => {
      this.user = data.session?.user || null;
      this._notify();
    });
    // Escuta mudanças (login, logout, magic link callback)
    this.client.auth.onAuthStateChange((_evt, session) => {
      this.user = session?.user || null;
      this._notify();
    });
    return true;
  },

  isReady() { return !!this.client; },
  getUser() { return this.user; },

  onAuthChange(cb) {
    this._authListeners.push(cb);
    cb(this.user);
  },
  _notify() { this._authListeners.forEach(cb => cb(this.user)); },

  async signIn(email) {
    if (!this.client) throw new Error('Supabase not configured');
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href.split('#')[0] }
    });
    if (error) throw error;
  },

  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
  },

  async listPatterns() {
    if (!this.user) return [];
    const { data, error } = await this.client
      .from('patterns')
      .select('id, title, updated_at, thumbnail, stitch, cols, rows')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async savePattern({ id, title, snapshot, thumbnail }) {
    if (!this.user) throw new Error('Not logged in');
    const row = {
      user_id: this.user.id,
      title: title || 'Sem título',
      stitch: snapshot.stitch,
      cols: snapshot.cols,
      rows: snapshot.rows,
      cells: snapshot.cells,
      swatch_map: snapshot.swatchMap,
      thumbnail,
      updated_at: new Date().toISOString()
    };
    let res;
    if (id) {
      res = await this.client.from('patterns').update(row).eq('id', id).select().single();
    } else {
      res = await this.client.from('patterns').insert(row).select().single();
    }
    if (res.error) throw res.error;
    return res.data;
  },

  async loadPattern(id) {
    if (!this.user) throw new Error('Not logged in');
    const { data, error } = await this.client.from('patterns').select('*').eq('id', id).single();
    if (error) throw error;
    return {
      stitch: data.stitch,
      cols: data.cols,
      rows: data.rows,
      cells: data.cells,
      swatchMap: data.swatch_map
    };
  },

  async deletePattern(id) {
    if (!this.user) throw new Error('Not logged in');
    const { error } = await this.client.from('patterns').delete().eq('id', id);
    if (error) throw error;
  }
};

// Gera uma thumbnail PNG (data URL) do padrão atual, ~150px no maior lado.
function generateThumbnail() {
  if (!Grid.canvas) return null;
  const tmp = document.createElement('canvas');
  const maxDim = 150;
  const ratio = Math.min(maxDim / Grid.canvas.width, maxDim / Grid.canvas.height, 1);
  tmp.width = Math.max(1, Math.round(Grid.canvas.width * ratio));
  tmp.height = Math.max(1, Math.round(Grid.canvas.height * ratio));
  const ctx = tmp.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, tmp.width, tmp.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(Grid.canvas, 0, 0, tmp.width, tmp.height);
  return tmp.toDataURL('image/png');
}
