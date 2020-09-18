export default class Eventually {
  constructor(delay, callback) {
    this.delay = delay;
    this.callback = callback;
    this.timeoutId = null;
  }

  reset() {
    this.cancel();
    this.timeoutId = window.setTimeout(this.callback, this.delay);
    return this;
  }

  cancel() {
    if (this.timeoutId) {
      window.clearTimeout(this.timeoutId);
    }
  }
}

export class EventuallyDispatch extends Eventually {
  constructor(delay, action) {
    super(delay, () => this.dispatch(this.action));
    this.action = action;
    this.dispatch = null;
  }
  static Dispatcher(dispatch, props) {
    props.ev.dispatch = dispatch;
    return () => props.ev.cancel();
  }
  Subscription() {
    return [EventuallyDispatch.Dispatcher, {ev: this}];
  }
}

