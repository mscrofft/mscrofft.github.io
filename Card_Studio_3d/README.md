# Card Studio 3D

Ferramenta web para criação e visualização de cartões 3D com renderização PBR (Physically Based Rendering) em tempo real. Tudo em um único arquivo `index.html`, sem dependências locais.

---

## Tecnologias

| Biblioteca | Versão | Uso |
|---|---|---|
| Three.js | r128 | Engine 3D / WebGL |
| UnrealBloomPass | r128 | Bloom pós-processamento |
| BokehPass | r128 | Profundidade de campo |
| EffectComposer | r128 | Pipeline de post-processing |

---

## Funcionalidades

### Acabamentos (Finish)

| Nome | Metalness | Roughness | Clearcoat |
|---|---|---|---|
| Matte | 0.0 | 0.9 | — |
| Glossy | 0.1 | 0.1 | 1.0 |
| Metal | 0.95 | 0.15 | 0.5 |
| Gold | 1.0 | 0.1 | 0.3 |
| Holo | 0.8 | 0.05 | 1.0 |
| Chrome | 1.0 | 0.02 | 1.0 |

Cada acabamento possui:
- **Normal map procedural** gerado via canvas (grain, brushed streaks para Metal)
- **envMapIntensity** calibrado por finish (Chrome: 2.2 · Gold: 1.8 · Metal: 1.5 · Glossy: 1.2 · Matte: 0.4)

---

### Iluminação

Quatro presets com IBL (Image-Based Lighting) dedicado por preset:

| Preset | Ambiente | Key Light | Bloom padrão |
|---|---|---|---|
| Natural | Branco frio | Branco 1.8× | 0.20 |
| Beauty | Roxo-azul | Laranja 2.2× | 0.35 |
| Glow | Azul escuro | Cyan + Magenta | 0.70 |
| Amber | Marrom escuro | Laranja âmbar 2.8× | 0.45 |

O `scene.environment` é trocado por um `DataTexture` gradiente específico de cada preset, processado via `PMREMGenerator`, garantindo reflexos coerentes com a iluminação ativa.

---

### Geometria do Cartão

- **Shape:** `ExtrudeGeometry` a partir de retângulo arredondado (r = 0.07)
- **Dimensões:** 1.7 × 1.07 unidades
- **Bevel:** espessura 0.01, 4 segmentos
- **Profundidade:** slider 1–30 (× 0.001 unidades Three.js)
- **Sombras:** `PCFSoftShadowMap`, shadow map 4096 × 4096

---

### Chip

- Geometria padrão: `BoxGeometry(0.22, 0.16, 0.02)` dourado com 3 listras metálicas
- Upload personalizado: PNG com fundo transparente → `PlaneGeometry(0.28, 0.20)` + `MeshPhysicalMaterial` (metalness 0.85)
- Posição ajustável via sliders X / Y (range −1.50 → 1.50 / −0.90 → 0.90)
- Atualização em tempo real sem rebuild do grupo

### Logo / Nome

- **Texto:** campo de input → renderizado em `CanvasTexture` 512 × 80 px
- **Imagem PNG:** `TextureLoader` com `anisotropy` máxima
- **SVG:** convertido para `CanvasTexture` 512 × 180 px via `Image` + canvas 2D
- Posição ajustável via sliders X / Y
- Texto e imagem são por cartão independentes

---

### Arranjos

| Nome | Descrição |
|---|---|
| Stack | Empilhado com offset leve |
| Fan | Leque radial (padrão) |
| Line | Linha horizontal |
| Ring | Círculo completo — cada cartão vira para fora |
| Cascade | Cascata diagonal |

Três sliders de Spread (X, Y, Z) controlam a dispersão de cada arranjo.

---

### Câmera e Interação

- **Auto Rotate:** acumulação direta de `orbitY` (sem lerp → sem saltos)
- **Orbit (drag):** lerp 8% por frame em X e Y
- **Zoom:** scroll do mouse / pinch mobile (range Z: 2–12)
- **Tilt X/Y:** sliders ±60°
- Lerp desacoplado: `orbitY` e `targetY` separados para evitar salto na troca de modo

---

### Post-Processing

| Efeito | Controle | Padrão |
|---|---|---|
| Bloom (UnrealBloomPass) | Slider 0–2.0 | Varia por preset de luz |
| Depth of Field (BokehPass) | Slider 0–10 | Off (aperture = 0) |

- `EffectComposer` substitui `renderer.render()` no loop e no export
- Export 4K redimensiona composer + renderer antes de capturar o canvas

---

### Texturas

| Campo | Posição no grupo | Formatos |
|---|---|---|
| Front Texture | `children[0].material.map` | PNG, JPG, WebP |
| Back Texture | Plane `rotation.y = π` | PNG, JPG, WebP |
| Chip | `Group('chip')` | PNG (transparente) |
| Logo | `Mesh('logo')` | PNG, SVG |

Todas as texturas carregadas recebem `anisotropy = getMaxAnisotropy()` automaticamente.

---

### Export

- Resolução: **3840 × 2160 (4K)**
- Formato: PNG via `canvas.toDataURL('image/png')`
- Fluxo: resize renderer → resize composer → `composer.render()` → download → restore

---

## Estrutura de Estado por Cartão

```js
{
  finish: 'matte',       // acabamento
  color: '#e85d26',      // cor base (hex)
  frontTex: null,        // THREE.Texture | null
  backTex: null,         // THREE.Texture | null
  chipTex: null,         // THREE.Texture | null
  logoTex: null,         // THREE.Texture | null
  logoText: 'STUDIO',    // string
  chipX: -0.8,           // posição X do chip
  chipY: 0.15,           // posição Y do chip
  logoX: 0.3,            // posição X do logo
  logoY: 0.7,            // posição Y do logo
  userRot: { x, y, z }, // rotação individual (graus)
  basePos: Vector3,      // posição do arranjo
  baseRotOffset: Euler,  // rotação do arranjo
  label: 'Card N',
  group: THREE.Group
}
```

---

## Painel Esquerdo — Controles de Estilo

- Finish (6 opções)
- Card Color (color picker)
- Front Texture (upload)
- Back Texture (upload)
- **Chip** — upload PNG + sliders X/Y
- **Logo / Nome** — campo de texto + upload PNG/SVG + sliders X/Y

## Painel Direito — Controles de Cena

- Cards (lista, adicionar, remover)
- Arrangement (5 presets)
- Spread X / Y / Z
- Card Rotation X / Y / Z + Quick Rotate
- Background (color picker + 4 presets)
- Light (4 presets)
- Tilt X / Y
- Depth
- **Bloom** (slider)
- **Depth of Field** (slider)

---

## Como usar

1. Abrir `index.html` diretamente no browser (ou servir via HTTP local)
2. Adicionar/remover cartões no painel direito
3. Configurar acabamento, cor e texturas no painel esquerdo
4. Ajustar chip e logo (texto ou imagem) com sliders de posição
5. Escolher arranjo, iluminação e efeitos
6. Clicar **↓ Export 4K** para baixar o render em PNG

> Mobile: usar os botões flutuantes para abrir os painéis em bottom sheets.
