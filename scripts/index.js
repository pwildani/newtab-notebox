
function makeNote(id, store) {
  const note = Vue.reactive({
    id: id,
    text: '',
    title: Vue.computed(() => note.text.split('\n', 1)[0]),
  });
  note.store = store;


  store.bind(note);
  note.save = function() {
    this.store.setItem('', this.text);
  };

  note.load = function() {
    const text = this.store.getItem('');
    this.text = text !== undefined && text !==null ? ''+text : '';
  };
  note.load();

  Vue.watch(() => note.text, (newValue) => note.save());
  return note;
};

class TraceStorage {
  constructor(store)  {
    this.storage = store;
  }
  getItem(key) {
    console.log("Get", key);
    return this.storage.getItem(key);
  }
  setItem(key, value) {
    console.log("Store", key);
    return this.storage.setItem(key, value);
  }
}

class ScopedStorage {
  constructor(storage, root, binder) {
    this.storage = storage;
    this.root = root;
    this.binder = binder
  }
  makeKey(key) {
    if (key) {
      return (this.root? this.root + '.': '') + key;
    }
    return this.root;
  }
  getItem(key) {
    return this.storage.getItem(this.makeKey(key));
  }
  setItem(key, value) {
    return this.storage.setItem(this.makeKey(key), value);
  }

  subScope(subscope) {
    return new ScopedStorage(this.storage, this.root + '.' + subscope, this.binder);
  }

  bind(target) {
    this.binder.bind(this.makeKey(''), target);
  }
  unbind(target) {
    this.binder.unbind(this.makeKey(''), target);
  }
}

// Bind things to get notified of changes to storage by a key prefix. The
// prefix uses . separated name spaces. Partial names are not prefixes.
class BindingStorage {
  constructor(storage) {
    this.name = genUuid();
    this.storage = storage;
    // keyprefix -> handler
    this.registry = {};
    // mutated keys -> true
    this.pendingKeys = {};
  }

  listen() {
    $(window).on('storage.binder.' + this.name, (e) => {
      if (e.storageArea === this.storage) {
        this.pendingKeys[e.key] = true;
      }
    });
  }

  unlisten() {
    $(window).off('storage.binder.' + this.name);
  }

  bind(prefix, target) {
    this.registry[prefix] = target;
  }

  unbind(prefix, target) {
    if (this.registry[prefix] === target) {
      this.registry[prefix] = undefined;
    }
  }

  resolve() {
    for (key in this.pendingKeys) {
      let route = key.split('.');
      for (let i = route.length - 1; i > 0; --i) {
        let target = this.registry[route.slice(0, i).join('.')];
        if (target) {
          target.load(this.subScope(route), key);
        }
      }
    }
    this.pendingKeys = {};
  }
  
  subScope(subscope) {
    return new ScopedStorage(this.storage, subscope, this);
  }
};

function genUuid() {
  const tohex2 = (i) => (i<16?'0':'') + (i).toString(16);
  const B = (d, i) => ((d >> (8*i)) & 0xff);
  const H = (d, i) => tohex2(B(d, i));

  const d0 = Math.random() * 0xffffffff|0;
  const d1 = Math.random() * 0xffffffff|0;
  const d2 = Math.random() * 0xffffffff|0;
  const d3 = Math.random() * 0xffffffff|0;

  const s1 = H(d0,0) + H(d0,1) + H(d0,2) + H(d0,3);
  const s2 = H(d1,0) + H(d1,1);
  const s51 = H(d2,2) + H(d2,3);
  const s52 = H(d3,0) + H(d3,1) + H(d3,2) + H(d3,3);
  const s3 = tohex2(B(d1,2)&0x0f|0x40) + H(d1,3);
  const s4 = tohex2(B(d2,0)&0x3f|0x80) + H(d2,1);

  return s1 + '-' + s2 + '-' + s3 + '-' + s4 + '-' + s51 + s52;
}


const storage = new BindingStorage(new TraceStorage(window.localStorage));

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

let calc = new Calc();

const store = {
  state: Vue.reactive({
    notes: [],
    selectedNote: null,
    calc: calc,
  }),
  noteStorage: storage.subScope('note'),
  calcStorage: storage.subScope('calc'),

  appendNewNote() {
    const id = genUuid();
    const note = makeNote(id, this.noteStorage.subScope(id));
    this.state.notes.push(note);
    this.noteStorage.setItem('', JSON.stringify(this.state.notes.map((n)=>n.id)));
    note.save(this.noteStorage);
  },

  loadNotes() {
    let noteStr = this.noteStorage.getItem('');
    if (!noteStr) {
      initializeStorage(); 
      noteStr = this.noteStorage.getItem('');
    }
    if (noteStr === '1') {
      noteStr = '[0]';
    }
    let noteids = JSON.parse(noteStr);
    let notes = noteids.map((id) => makeNote(id, this.noteStorage.subScope(id)));
    this.state.notes = notes;
  }
};
  

const app = Vue.createApp({
  data() {
    return {
      shared: store.state,
    };
  },
  methods:{
    onSelectNote(note_id) {
      this.shared.selectedNote = this.shared.notes[note_id];
    },
  },

  mounted() {
    store.loadNotes();
    this.shared.selectedNote = this.shared.notes[0];
    store.calcStorage.bind(store.state.calc);
    store.state.calc.load(store.calcStorage);
    window.$app = this;
  },

  methods: {
    onKeyUp(e) {
      if (e.key == "Enter") {
        let notebox = e.currentTarget;
        let expr = findExprAt(notebox.value, notebox.selectionStart-1);
        if (expr !== undefined) {
          console.log('evaluating', expr);
          let result = evalExpr(this.shared.calc, expr);
          if (result !== undefined) {
            e.preventDefault();
            // inject result into text
            let before = notebox.value.substr(0, notebox.selectionStart-1);
            let after = notebox.value.substr(notebox.selectionStart);
            let val = [before ,  ' '+ result , after].join('');
            notebox.value = val;
          }
        }
      }
    },

    onInput(e) {
      let notebox = e.currentTarget;
      this.shared.selectedNote.text = notebox.value;
      console.log('update note', this.shared.selectedNote);
    }
  },

  render() {
    const h = Vue.h;
    const div = (cls, props, contents) => h('div', {'class': cls, ...props}, contents);
    const textarea = (cls, props, contents) => h('textarea', {'class': cls, ...props}, contents);
    return [
      div('left-sidebar', {}, [
        h(Vue.resolveComponent('note-list'), {
          'class': 'note-list',
          'onSelectNote': this.onSelectNote
        })]),
      // TODO: <button class="add-note">+</button>
      div('content-view',{}, [
        textarea('notebox', {
          'value':this.shared.selectedNote ? this.shared.selectedNote.text: '',
          'oninput':this.onInput,
          'onchange': this.onInput,
          'onkeyup': this.onKeyUp,
        }),
        h('br'),
        textarea('stack'),
        textarea('vocabulary'),
      ]),
    ];
    /*
     <div class="main-view" @select-note="onSelectNote" data-server-rendered="true">
      <div class="left-sidebar">
      <note-list class="left-sidebar note-list"></note-list>
      <button class="add-note">+</button>
      </div>
      <div class="content-view">
        <textarea class="notebox" v-model="note_text"></textarea>
        <br>
        <textarea class="stack"></textarea>
        <textarea class="vocabulary"></textarea>
      </div>
    </div>
  */
  },
});

app.component('note-list', {
  data() {
    return {
      shared: store.state,
    };
  },
  /*
  template: `
    <ul>
      <note-tab
        v-for="note in notes"
        v-bind:note="note"
        key="note.id"
        ></note-tab>
    </ul>
    `,
  */
  render() {
    const h = Vue.h;
    return h('ul', {}, this.shared.notes.map(n=> h(
      Vue.resolveComponent('note-tab'), {
        'note':n,
        'key':n.id,
      })));
  }
});

app.component('note-tab', {
  props: ['note'],
  emits: ['select-note'],
  /*
  template: `
    <li @click="$emit('select-note', note.id)">
      <span class="note-title">{{note.title}]</span>
    </li>
  `,
  */
  render() { 
    const h = Vue.h;
    return h('li', {'onClick':this.$emit('select-note', this.note.id)}, [
      h('span', {'class':'note-title'}, [this.note.title])]);
  }
});


//TODO: $(window).on('focus', function() { store.resolve(); });

window.calc = calc;

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

/*
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
*/

$(document).ready(function() {
  // Avoid displaying unstyled content until the JS is ready.
  document.body.style = "";
  window.vm = app.mount('.main-view');
  console.log(window.vm);
  calc.displayVocabulary();
});



function initializeStorage() {
  window.localStorage.setItem('note', '[0]');
  window.localStorage.setItem('note.0', '');
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


