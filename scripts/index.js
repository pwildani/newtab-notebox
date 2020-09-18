import {h, text, app} from "./hyperapp.js";
import html from "./hyperlit.js";
import {Calc} from "./calculator.js";
import {BindingStorage, TraceStorage, ScopedStorage} from "./storage.js";
import genUuid from "./uuid.js";
import {EventuallyDispatch} from "./eventually.js";


const noteTitle = (note) => note.title || h('i',{},text("New Note"));
const noteListItem = (state, note) => html`
  <li key=${note.id}
      class=${{
        selected: state.selectedNote == note.id,
        dirty:state.dirtyNotes[note.id],
      }}>
    <a onclick=${[SelectNote, note.id]}>
      ${noteTitle(note)}
    </a>
  </li>
`;

const noteList = state => html`
  <ul class="note-list">${state.noteList.map(id => noteListItem(state, state.notes[id]))}</ul>
  <button class="add-note" onclick=${AppendAndSelectNote}>+</button>
`;

const noteDetails = (note, calc) => html`
  <div class="content-view">
    <textarea class="notebox"
        onkeyup=${EditNoteKeyUp}
        oninput=${EditNoteInput}
        onchange=${EditNoteChange}
      >${text(note.text)}</textarea>
    <br/>
    <textarea class="stack">${renderStack(calc)}</textarea>
    <textarea class="vocabulary">${renderVolcabulary(calc)}</textarea>
  </div>
`;

const main = state => html`
<div>
  <div class="left-sidebar">
  ${noteList(state)}
  </div>
  ${state.selectedNote !== null && noteDetails(state.notes[state.selectedNote], state.calc)}
</div>
`;


const storageRoot = new BindingStorage(new TraceStorage(window.localStorage));

function LoadStorageKey(state, event) {
  state.storage.handleEvent(event);
  return state;
}

function NoteLoaded(state, event) {
  if (event.detail.id === state.selectedNote) {
    return [state, [Then, {action:SelectNote, arg:event.detail.id}]];
  }
  return state;
}

class Note {
  constructor(id) {
    this.id = id;
    this._text = '';
    this.title = '';
  }
  get text() {
    return this._text;
  }
  set text(text) {
    this._text = text;
    this.title = this._text.split('\n', 1)[0];
  }

  save(store) {
    store.setItem('', this.text);
  }

  load(store, key) {
    const text = store.getItem('');
    this.text = text === undefined || text === null ? '' : ''+text;
    window.dispatchEvent(new CustomEvent("NoteLoaded", {detail: this}));
  }
}

function InitialLoadNotes(dispatch, {state}) {
  let store = state.noteStorage;
  let noteStr = store.getItem('');
  if (!noteStr) {
    initializeStorage(store); 
    noteStr = store.getItem('');
  }

  if (noteStr == "1") {
    noteStr = "[\"0\"]";
  }

  let noteList = JSON.parse(noteStr);
  let notes = {};
  noteList.map((id) => new Note(id)).forEach((note) => {
    store.bind(note.id, note);
    note.load(store.subScope(note.id));
    notes[note.id] = note;
  });

  dispatch({...state, noteList, notes, selectedNote: noteList[0]});
}

function AppendNewNote(state, id) {
  const note = new Note(id);
  let noteList = state.noteList.map(x=>x);
  noteList.push(id);
  let notes = {...state.notes};
  notes[id] = note;
  return {...state, noteList, notes};
}

function SelectNote(state, id) {
  return [{...state, selectedNote: null}, [Then, {action:_SelectNote, arg:id}]]
}

function _SelectNote(state, id) {
  return {...state, selectedNote: id}
}


function Then(dispatch, {action, arg}) {
  dispatch(action, arg);
}

function Later(dispatch, {action, arg}) {
  requestAnimationFrame(() => dispatch(action, arg));
}
function AppendAndSelectNote(state) {
  const id = genUuid();
  return [state,
    [Then, {action:AppendNewNote, arg:id}],
    [Then, {action:SelectNote, arg:id}],
    [Then, {action:EventuallySave}],
  ];
}

function EventuallySave(state) {
  state.eventuallySave.reset();
  return state;
}

const listenToEvent = (dispatch, props) => {
  const listener = (event) =>
    requestAnimationFrame(() => dispatch(props.action, event))

  addEventListener(props.type, listener)
  return () => removeEventListener(props.type, listener)
}
export const listen = (type, action) => [listenToEvent, { type, action }]

function SaveAll(state) {
  // Root key is notes in display order.
  state.noteStorage.setItem('', JSON.stringify(state.noteList));

  // Notes are stored as subkeys as their id.
  state.noteList.forEach(id => {
    let note = state.notes[id];
    state.noteStorage.bind(id, note);
    note.save(state.noteStorage.subScope(id));
  });
  return state;
}

function SaveDirtyNotes(state) {
  return [
    {...state, dirtyNotes: {}},
    [SaveNotesEffect,
      {
        notes: Object.entries(state.dirtyNotes).map(([id, _])=>state.notes[id]),
        storage: state.noteStorage,
      }
    ],
  ];
}

function SaveNotesEffect(dispatch, {notes, storage}) {
  notes.forEach((note) => note.save(storage.subScope(note.id)));
}
  
function EditNoteKeyUp(state, event) {
  // This is an action, but it's only manipulating the state of the note, spill
  // out to an effect.
  return [state, [MaybeRunCalculatorAtCursor, {event, calc:state.calc}]]
}

function MaybeRunCalculatorAtCursor(dispatch, {event, calc}) {
  if (event.key == "Enter" || event.key == " ") {
    let notebox = event.currentTarget;
    let expr = findExprAt(notebox.value, notebox.selectionStart-1);
    if (expr !== undefined) {
      console.log('evaluating', expr);
      let result = evalExpr(calc, expr);
      if (result !== undefined) {
        event.preventDefault();
        // inject result into text
        let before = notebox.value.substr(0, notebox.selectionStart-1);
        let after = notebox.value.substr(notebox.selectionStart);
        let val = [before ,  ' '+ result , after].join('');
        notebox.value = val;
      }
    }
  }
}

function EditNoteInput(state, e) {
  let notebox = e.currentTarget;
  let note = state.notes[state.selectedNote];
  note.text = notebox.value;
  let dirtyNotes = {...state.dirtyNotes}
  dirtyNotes[note.id] = true;
  state.eventuallySaveNote.reset();
  return {...state, dirtyNotes}
}

function EditNoteChange(state, e) {
  return EditNoteInput(state, e);
}

const renderStack = function(calc) {
  return calc.stack.map((x) => "" + x).join('\n');
};

const renderVolcabulary = function(calc) {
  let vocab = calc.modes['immediate'];

  let result = [];
  for (let key in vocab) {
    if (Object.prototype.hasOwnProperty.call(vocab, key)) {
      let defn = vocab[key];
      result.push(': ' + key + ' ' + ( defn.body? defn.body.join(' ') : '<builtin>') + ' ;');
    }
  }
  return result.join('\n');
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

function initializeStorage(store) {
  store.setItem('', '[0]');
  store.setItem('0', '');
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


function InitializeState() {
  let blankState = {

    // Note ids in order
    noteList: [],
    // Notes indexed by id.
    notes: {},
    // Current note loaded in the editor.
    selectedNote: null,

    // Calculator state
    calc: new Calc(),

    storage: storageRoot,
    noteStorage: storageRoot.subScope('note'),
    calcStorage: storageRoot.subScope('calc'),

    eventuallySave: new EventuallyDispatch(33, SaveAll),
    eventuallySaveNote: new EventuallyDispatch(33, SaveDirtyNotes),
    dirtyNotes: {},
  };
  return [blankState, [InitialLoadNotes, {state: blankState}]];
}


app({
  node: document.querySelector(".main-view"),
  init: [InitializeState],
  view: main,
  subscriptions: (state) => [
    // Edits from other instances of this page
    listen("storage", LoadStorageKey),
    listen("NoteLoaded", NoteLoaded),

    state.eventuallySave.Subscription(),
    state.eventuallySaveNote.Subscription(),
  ],
})
