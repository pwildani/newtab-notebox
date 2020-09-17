### New tab with a persistent text box and calculator.

Trigger the calculator by adding a line in the notes that ends with `=?` and
press enter.

The accepted syntax is RPN or Forth-like. It needs a few more basics to be
programmable, but a usable core is there. Numbers work, as do the basic 4
calculator operations. Define a new word with `: word ... ;`

The value inserted after the `=?` marker is the top entry on the stack after
evaluation.

The notes are persistent and and shared between tabs.

The calculator word definitions are persistent and shared between tabs.

The calculator stack IS NOT persistent or shared between tabs.

The lower left box is a view of the calculator stack. It is not editable.

The lower right box is a view of the word definitions in the calculator. It is not editable.

### Extention dev mode

`chrome://extension`, Enable developer mode, Click "Load unpacked", point at this dir (the one with `manifest.json`)
