/*
 * One DevTools connection to Chrome (item 1182): send a request, get its reply.
 *
 * The part that matters is the end. When the socket closes or errors -- Chrome
 * killed, crashed, or reaped -- every request still waiting for a reply is
 * rejected at once with a DroppedConnection naming the close, and every later
 * send is refused the same way. Before this, a waiting request hung forever:
 * Node's event loop drained, the playtest's catch and finally never ran, and it
 * exited 0 with no summary, so a dead run read as green.
 *
 * `ws` is anything with addEventListener and send -- Node's built-in WebSocket
 * in the playtest, a stand-in in test/cdp-connection.test.js. Plain Node, no
 * dependencies.
 */

/** Chrome's DevTools connection went away before the run finished. */
export class DroppedConnection extends Error {
  constructor(message) {
    super(message);
    this.name = 'DroppedConnection';
  }
}

export class CdpConnection {
  constructor(ws) {
    this.ws = ws;
    this.next = 1;
    this.pending = new Map();
    /** Null while the socket is open; the DroppedConnection once it is not. */
    this.dropped = null;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    });
    ws.addEventListener('close', (ev) => {
      this.drop(`Chrome's DevTools connection closed (code ${ev && ev.code !== undefined ? ev.code : '?'}` +
        `${ev && ev.reason ? ', ' + ev.reason : ''})`);
    });
    ws.addEventListener('error', (ev) => {
      const why = ev && (ev.message || (ev.error && ev.error.message));
      this.drop(`Chrome's DevTools connection failed${why ? ': ' + why : ''}`);
    });
  }

  /** Reject everything still waiting, and refuse whatever comes after. The first reason wins. */
  drop(reason) {
    if (!this.dropped) this.dropped = new DroppedConnection(reason);
    const waiting = [...this.pending.entries()];
    this.pending.clear();
    for (const [id, p] of waiting) {
      const e = new DroppedConnection(`${this.dropped.message}; request ${id} (${p.method}) never got a reply`);
      p.reject(e);
    }
  }

  send(method, params = {}) {
    if (this.dropped) {
      return Promise.reject(new DroppedConnection(`${this.dropped.message}; refused to send ${method}`));
    }
    const id = this.next++;
    const reply = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
    try {
      this.ws.send(JSON.stringify({ id, method, params }));
    } catch (e) {
      this.drop(`Chrome's DevTools connection refused a send: ${e.message}`);
    }
    return reply;
  }
}
