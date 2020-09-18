$(document).ready(function() {

  
  let tracestore = {
    storage: window.localStorage,
    getItem: function (key) {
      console.log("Get", key);
      return this.storage.getItem(key);
    },

    setItem: function (key, value) {
      console.log("Store", key);
      return this.storage.setItem(key, value);
    },
  };

  let store = new StorageBinder("uniquename", tracestore);
  store.listen();
  $(window).on('focus', function() { store.resolve(); });

  let noteMgr = new Notes($('.notebox')[0]);
  store.bind("note", noteMgr)

  var calc = new Calc();
  window.calc = calc;
  store.bind("calc.0", calc);

  calc.displayStack = function() {
    $('.stack')[0].value = this.stack.map((x) => "" + x).join('\n');
  };

  calc.displayVocabulary = function() {
    let vocab = this.modes['immediate'];

    let result = [];
    for (let key in vocab) {
      if (Object.prototype.hasOwnProperty.call(vocab, key)) {
        let defn = vocab[key];
        result.push(': ' + key + ' ' + ( defn.body? defn.body.join(' ') : '<builtin>') + ' ;');
      }
    }
    $('.vocabulary')[0].value = result.join('\n');
  };

  $('.notebox').on('keyup', function(e) {
    if (e.key == "Enter") {
      let expr = findExprAt(this.value, this.selectionStart-1);
      if (expr !== undefined) {
        let result = evalExpr(calc, expr);
        if (result !== undefined) {
          e.preventDefault();
          // inject result into text
          let before = this.value.substr(0, this.selectionStart-1);
          let after = this.value.substr(this.selectionStart);
          let val = [before ,  ' '+ result , after].join('');
          this.value = val;
        }
      }
    }

    noteMgr.saveToStorage("note", store.storage);
    calc.saveToStorage("calc." + noteMgr.currentNote, store.storage);
  });

  // Avoid displaying unstyled content until the JS is ready.
  calc.displayVocabulary();
  document.body.style = "";
});

// Bind things to get notified of changes to storage by a key prefix. The
// prefix uses . separated name spaces. Partial names are not prefixes.
function StorageBinder(name, storage) {
  this.name = name;
  this.storage = storage;

  // keyprefix -> handler
  this.registry = {};

  // mutated keys -> true
  this.pendingKeys = {};
}

StorageBinder.prototype = {
  listen: function() {
    $(window).on('storage.binder.' + this.name, (e) => {
      if (e.storageArea === this.storage) {
        this.pendingKeys[e.key] = true;
      }
    });
  },

  unlisten: function() {
    $(window).off('storage.binder.' + this.name);
  },

  bind: function(prefix, target) {
    this.registry[prefix] = target;
    target.loadFromStorage(prefix, null, this.storage);
  },

  unbind: function(prefix, target) {
    if (this.registry[prefix] === target) {
      this.registry[prefix] = undefined;
    }
  },

  resolve: function() {
    for (key in this.pendingKeys) {
      let route = key.split('.');
      for (let i = route.length - 1; i > 0; --i) {
        let target = this.registry[route.slice(0, i).join('.')];
        if (target) {
          target.loadFromStorage(route, key, this.storage);
        }
      }
    }
    this.pendingKeys = {};
  },
};


function initializeStorage() {
  window.localStorage.setItem('note', '1');
  window.localStorage.setItem('note.0', '');
}


function loadNotes(prefix, storage) {
  let notestr = storage.getItem(prefix);
  if (!notestr) {
    initializeStorage(); 
    return [{"index":0, "contents": ""}];
  } else {
    let numNotes = JSON.parse(notestr);
    let notes = [];
    for (let i = 0; i < numNotes; i++) {
      notes.push({
        "index": i,
        "contents": storage.getItem(prefix + '.' + i)
      });
      return notes;
    }
  }
}


function selectNote(notes, noteIndex, display) {
  display.value = notes[noteIndex].contents;
}


function saveNote(notes, noteIndex, newcontents, storage) {
  let oldcontents = notes[noteIndex].contents;
  if (newcontents !== oldcontents) {
    notes[noteIndex].contents = newcontents;
    storage.setItem('note.' + noteIndex, newcontents);
  }
}


function findExprAt(body, end) {
  // Line ending at end
  let start = end;
  for (; start > 0 && body[start-1] !== '\n'; start--) {}
  let line = body.substr(start, end-start);

  // Have expression marker
  if (line.substr(line.length-2, 2) !== '=?') {
    return;
  }
  let expr = line.substr(0, line.length-2);
  return expr;
}


function evalExpr(calc, expr) {
  let words = expr.split(/\s+/);
  console.log(words);

  let i = 0;
  let nextWord = () => {
    return words[i++];
  }
  let val = undefined;
  while (i < words.length) {
    val = calc.evalWord(nextWord(), nextWord);
  }
  console.log('result', val);
  return val;

}


function Calc() {
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
          let a = this.stack.pop();
          let b = this.stack.pop();
          this.stack.push(a + b);
        }},
      '-': {eval: () => {
          let a = this.stack.pop();
          let b = this.stack.pop();
          this.stack.push(a - b);
        }},
      '*': {eval: () => {
          let a = this.stack.pop();
          let b = this.stack.pop();
          this.stack.push(a * b);
        }},
      '/': {eval: () => {
          let a = this.stack.pop();
          let b = this.stack.pop();
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

  this.saveToStorage = (prefix, storage) => {
    let defs = JSON.stringify(this.modes['immediate']);
    storage.setItem(prefix + '.defs', defs);
  };

  this.loadFromStorage = (prefix, key, storage) => {
    let defstr = storage.getItem(prefix + '.defs');
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


function Notes(display) {
  this.display = display;
  this.currentNote = 0;
  this.notes = [];

  this.loadFromStorage = function(prefix, key, storage) {
    this.notes = loadNotes(prefix, storage);
    selectNote(this.notes, this.currentNote, this.display);
  };

  this.saveToStorage = function (prefix, storage) {
    this.notes = loadNotes(prefix, storage);
    saveNote(this.notes, this.currentNote, this.display.value, storage);
    selectNote(this.notes, this.currentNote, this.display);
  };
}

