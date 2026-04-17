let inc = true;
let scene = [];

// quantidade maxima de linhas
const UPBOUND = 700;

// quantidade minima (tem que ser maior que zero)
const BOTTOMBOUND = 1;

// tamanho da pupila em px (raio interno)
const PUPILA = 50;

// proporcao do tamanho da iris (qto maior o numero, menor a iris)
const IRIS = 0.9;

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(0);
  scene.push(randomLine());
  plot();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // sem chamar plot() diretamente — draw() cuida disso no próximo frame
}

function draw() {
  if (scene.length >= UPBOUND) {
    inc = false;
  } else if (scene.length < BOTTOMBOUND) {
    inc = true;
  }

  inc ? scene.push(randomLine()) : scene.shift();

  plot();
}

function randomLine() {
  return {
    deg: random(360),
    r: random(255),
    g: random(255),
    b: random(255)
  };
}

function plot() {
  background(0);

  // raio externo da iris: metade do menor lado da tela
  const raio = (Math.min(width, height) / 2) * IRIS;

  push();
  translate(width / 2, height / 2);

  for (let i = 0; i < scene.length; i++) {
    const { deg, r, g, b } = scene[i];

    push();
    rotate(radians(deg));
    strokeWeight(1);
    stroke(r, g, b);
    // linha radial: sai da borda da pupila até o raio da iris
    line(PUPILA, 0, raio, 0);
    pop();
  }

  pop();
}
