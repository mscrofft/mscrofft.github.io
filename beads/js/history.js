const History = {
  stack: [],
  pointer: -1,
  max: 60,

  push(snapshot) {
    this.stack = this.stack.slice(0, this.pointer + 1);
    this.stack.push(snapshot);
    if (this.stack.length > this.max) this.stack.shift();
    this.pointer = this.stack.length - 1;
  },

  undo() {
    if (this.pointer > 0) { this.pointer--; return this.stack[this.pointer]; }
    return null;
  },

  redo() {
    if (this.pointer < this.stack.length - 1) { this.pointer++; return this.stack[this.pointer]; }
    return null;
  },

  reset(initial) {
    this.stack = [initial];
    this.pointer = 0;
  }
};

function cloneCells(cells) { return cells.map(row => row.slice()); }
