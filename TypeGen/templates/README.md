# Como gerar um esqueleto para o TypeGen no Adobe Illustrator

O TypeGen importa SVGs com **1 arquivo por glyph**. Cada arquivo representa um caractere desenhado dentro de uma "caixa" 500×700 (= grade 5×7, com 100 unidades por célula). Você pode desenhar livremente com linhas, curvas Bézier e arcos — o importador converte para o esqueleto interno.

## 1. Configurar o documento

- **New Document** → Width 500 px, Height 700 px, 1 artboard.
- Ative **Show Grid** com gridline cada 100 px (preferences → Guides & Grid).
- Coloque os limites do glyph **dentro** do artboard. O importador escala automaticamente o `viewBox` do SVG para a grade 5×7 do TypeGen.

Use o arquivo `A.svg` deste diretório como ponto de partida — abra no Illustrator e remova/substitua os traços de exemplo.

## 2. Regras de desenho

- Desenhe **apenas paths sem fill** (stroke qualquer cor/espessura — só a geometria conta).
- Ferramentas que funcionam:
  - **Line Segment** (linha reta) → vira primitiva `line`
  - **Pen Tool** com pontos angulares → cadeia de `line`
  - **Pen Tool** com handles → primitiva `bezier`
  - **Ellipse Tool** desenhando um círculo perfeito → primitiva `arc` de 360°
  - **Arc Tool** (segmento de círculo) → primitiva `arc`
- Evite compound paths e grupos aninhados profundos — funciona, mas pode dar resultado imprevisível.
- Não desenhe a grade dentro da camada principal — use uma camada `id="grid"` ou `id="guides"` com `display="none"` (o importador ignora elementos dentro dessas camadas).

## 3. Múltiplos glyphs em vários arquivos

Para cada caractere crie um arquivo SVG separado. O nome do arquivo define o caractere:

| Arquivo | Caractere |
|---|---|
| `A.svg` | A |
| `a.svg` | a |
| `aacute.svg` | á |
| `Glyph_period.svg` | . |
| `comma.svg` | , |
| `space.svg` | (espaço) |

Nomes aceitos: 1 letra/dígito direto, ou nome AGL (Adobe Glyph List): `period`, `comma`, `colon`, `semicolon`, `exclam`, `question`, `parenleft`, `parenright`, `bracketleft`, `bracketright`, `braceleft`, `braceright`, `slash`, `backslash`, `hyphen`, `underscore`, `plus`, `equal`, `asterisk`, `at`, `numbersign`, `dollar`, `percent`, `ampersand`, `zero`–`nine`, etc. E acentuados: `aacute`, `acircumflex`, `atilde`, `ccedilla`, `eacute`, `ntilde`, `oacute`, `otilde`, etc. Se o nome não bater, o importador pede o caractere via prompt.

## 4. Exportar no Illustrator

`File → Export → Export As… → SVG (svg)`

- **Use Artboards: All** (se você tiver múltiplos artboards no documento).
- Cada artboard vira um arquivo separado, prefixado pelo nome do arquivo, com o nome do artboard ao final: `MeuFonte_A.svg`, `MeuFonte_period.svg`, etc.

Alternativa simples: **um arquivo `.ai` por glyph** e exportar cada um individualmente.

## 5. Importar no TypeGen

1. Abrir o editor.
2. Tab **Importar** → seção **SVG (Illustrator/Inkscape)** → **Importar SVG…**.
3. Selecionar todos os SVGs de uma vez (Shift+clique no diálogo de arquivos).
4. O grid de glyphs à direita é atualizado, cada glyph importado fica marcado com o ponto de "edited".

## 6. Workflow no Inkscape

Mesma ideia. Crie um documento 500×700, desenhe o glyph na camada principal, salve como `Plain SVG`. O nome do arquivo segue as mesmas regras.

## 7. Workflow no Figma

Selecione o frame do glyph, **Export → SVG**. Renomeie o arquivo para o caractere (`A.svg`) ou para o nome AGL antes de importar.

## Limitações conhecidas

- Arcos com `rx ≠ ry` (elipses) são aproximados como círculos (média dos raios).
- Curvas T/S (smooth) funcionam, mas se houver path inicial estranho podem perder a tangente.
- O importador faz `fit` no viewBox/artboard, não no bbox do desenho. Se você desenha algo bem fora do centro do artboard, a normalização desloca/escala junto.
- Compound paths em Illustrator às vezes viram um único `<path>` longo — o importador desenrola, mas conformidade depende do quão "limpo" está o path data.
