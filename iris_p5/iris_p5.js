let inc = true;
let scene = [];


// quantidade maxima de linhas
const UPBOUND = 700;

// quantidade minima (tem que ser maior que zero)
const BOTTOMBOUND = 1;

// tamanho da pupila em px
const PUPILA = 50;

// proporcao do tamanho da iris (qto maior o numero, menor a iris)
const IRIS = 0.9;

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(0, 0, 0);
  scene.push(randomLine());
  plot();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  background(0, 0, 0);
  plot();
}

function draw() {

  if( scene.length >= UPBOUND ){
    inc = false;
  } else if (scene.length < BOTTOMBOUND ) {
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
  }
}

function plot() {
  background(0);
  translate(windowWidth/2, windowHeight/2);
  rotate(0);

  for( let i = 0; i < scene.length; i++ ){
    const {deg, r, g, b} = scene[i];
    rotate(radians(deg))
    strokeWeight(1);
    stroke(r, g, b);
    line(
      PUPILA, 
      PUPILA, 
      (Math.min(height, width) - PUPILA)/IRIS, 
      (Math.min(height, width) - PUPILA)/IRIS
    );
    rotate(radians(360 - deg));
  }
}
