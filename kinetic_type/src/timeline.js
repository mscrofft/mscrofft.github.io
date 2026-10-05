// Easing + cycle helpers for animation
window.Easing = {
  linear: t => t,
  easeInOut: t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2,
  easeOutCubic: t => 1 - Math.pow(1 - t, 3),
  triangle: t => 1 - Math.abs(2*t - 1),
  pingpong: t => Math.sin(t * Math.PI * 2) * 0.5 + 0.5,
};
