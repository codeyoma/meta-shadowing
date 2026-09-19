export type PaidAccess = Readonly<{revision:number;allowed:boolean}>;
const valid = (v: unknown): v is PaidAccess => !!v && typeof v === 'object'
  && Number.isSafeInteger((v as PaidAccess).revision) && (v as PaidAccess).revision >= 0
  && typeof (v as PaidAccess).allowed === 'boolean';

/** Native events are the only grant source. A bridge failure latches closed until refresh. */
export class PaidAccessStore {
  private current: PaidAccess = {revision:0,allowed:false};
  private failed = false;
  private epoch = 0;
  private listeners = new Set<() => void>();
  private stop?: () => void;
  constructor(private bridge: {read():Promise<unknown>;listen(fn:(value:unknown)=>void):()=>void}) {}
  private start() {
    if (this.stop) return;
    try { this.stop = this.bridge.listen(value => this.accept(value)); }
    catch { this.deny(); }
  }
  getSnapshot = () => this.current;
  subscribe = (fn:()=>void) => { this.start(); this.listeners.add(fn); return () => {this.listeners.delete(fn);}; };
  private set(value:PaidAccess) {
    if (value.revision === this.current.revision && value.allowed === this.current.allowed) return;
    this.current = {...value}; for (const fn of this.listeners) fn();
  }
  private deny() { this.epoch++; this.failed=true; this.set({...this.current,allowed:false}); }
  private accept(value:unknown, fresh = false) {
    if (!valid(value)) {this.deny();return;}
    if (value.revision < this.current.revision) return;
    if (this.failed && !fresh) { if (!value.allowed) this.set(value); return; }
    if (fresh) this.failed=false;
    this.set(value);
  }
  refresh = async ():Promise<PaidAccess> => {
    this.start(); if(!this.stop) return this.current;
    const epoch=++this.epoch;
    try { const value=await this.bridge.read(); if(epoch===this.epoch) this.accept(value,true); }
    catch { if(epoch===this.epoch) this.deny(); }
    return this.current;
  };
}
