
export function Calc() {
  this.handleUndefinedWord = () => {};

  this.modes = {};
  this.modes['builtins'] = {
      '': {eval: (word) => {
        let flt = parseFloat(word);
        if (!isNaN(flt)) {
          this.stack.push(flt);
        } else {
          this.handleUndefinedWord(word);
        }
      }},
      ':': {eval: (word) => { 
          this.mode = this.modes[word];
          this.compile_mode = word;
          this.defn_mode = 'immediate';
          this.defn_name = this.readWord();
          this.defn_body = [];
        }},
      '+': {eval: () => {
          let b = this.stack.pop();
          let a = this.stack.pop();
          this.stack.push(a + b);
        }},
      '-': {eval: () => {
          let b = this.stack.pop();
          let a = this.stack.pop();
          this.stack.push(a - b);
        }},
      '*': {eval: () => {
          let b = this.stack.pop();
          let a = this.stack.pop();
          this.stack.push(a * b);
        }},
      '/': {eval: () => {
          let b = this.stack.pop();
          let a = this.stack.pop();
          this.stack.push(a / b);
        }},
       'drop': {eval: () => this.stack.pop()},
       'dup': {eval: () => this.stack.push(this.stack[this.stack.length-1])},
    };

  this.modes['immediate'] = Object.create(this.modes['builtins']);

  // Define mode
  this.modes[':'] =  {
    '': {eval: (word) => { 
      this.defn_body.push(word);
    }},

    // Exit define mode.
    ';': {eval: (word) => {
      this.modes[this.defn_mode][this.defn_name] = {
        eval: null,
        body: this.defn_body,
      };
      this.mode = this.modes['immediate'];
    }},

    // Enter macro mode
    '[': {eval: (word) => {
      this.mode = this.modes['['];
    }},
  };

  // Exit macro mode
  this.modes['['] = Object.create(this.modes['immediate']);

  // Exit immediate-in-define mode
  this.modes['['][']'] = {
    eval: (word) => {
      this.mode = this.modes[this.compile_mode]
    }};

  // Emit top of stack into definition.
  this.modes['[']['`'] = {
    eval: (word) => {
      this.defn_body.push(this.stack.pop);
    }};

  this.mode = this.modes['immediate'];
  this.stack = [];
  this.retstack = [];
  this.step = false;
  this.displayStack = function() {};
  this.displayVocabulary = function() {};

  this.pushStackFrame = (word) => {
    let defn = this.mode[word];
    if (!defn) {
      defn = this.mode['']
    }
    if (defn.eval) {
      defn.eval(word, defn);
    } else {
      this.retstack.push({pc:0, code: defn.body, step:this.step});
    }
  };

  this.evalFrameStep = (frame) => {
    if (frame != undefined && frame.pc < frame.code.length) {
      let word = frame.code[frame.pc];
      frame.pc += 1;
      this.pushStackFrame(word);
      return true;
    }
    return false;
  };

  this.resume = () => {
    while(this.evalFrameStep(this.retstack[this.retstack.length-1])) {
      let frame = this.retstack[this.retstack.length-1];
      if (this.step && this.frame.step) {
        break;
      }
    }
  };

  this.evalWord = (word, readWord) => {
    this.readWord = readWord;
    this.pushStackFrame(word);
    this.resume();
    this.displayStack();
    this.displayVocabulary();
    return this.stack[this.stack.length-1];
  };

  this.push = (value) => {
    this.stack.push(value);
  };

  this.save = (storage) => {
    let defs = JSON.stringify(this.modes['immediate']);
    storage.setItem('defs', defs);
  };

  this.load = (storage) => {
    let defstr = storage.getItem('defs');
    if (defstr) {
      let defs = JSON.parse(defstr);
      if (defs !== undefined) {
        this.modes['immediate'] = Object.create(this.modes['builtins']);
        Object.assign(this.modes['immediate'], defs);
      }
    }
    this.displayVocabulary();
  };
}
