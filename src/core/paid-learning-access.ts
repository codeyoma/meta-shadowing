import type { PaidAccess } from './paid-access';
export type AccessSource = {refresh():Promise<PaidAccess>;subscribe(fn:(snapshot:PaidAccess)=>void):()=>void};
export class PaidLearningAccess {
  private revision = -1;
  private permitted = false;
  private disposed = false;
  private generation = 0;
  private stop:()=>void;
  constructor(private source:AccessSource, private revoke:()=>void, private changed:(allowed:boolean)=>void = () => {}) {
    this.stop=source.subscribe(value => {
      if(this.disposed || value.revision < this.revision) return;
      this.revision=value.revision;
      if(!value.allowed) { this.suspend();this.revoke(); }
    });
  }
  allowed() {return !this.disposed && this.permitted;}
  suspend() {this.generation++;this.permitted=false;this.changed(false);}
  async enter() {
    this.suspend();
    const generation=this.generation;
    try {
      const value=await this.source.refresh();
      if(this.disposed || generation!==this.generation || value.revision<this.revision) return false;
      this.revision=value.revision;this.permitted=value.allowed;
      this.changed(this.permitted);
      if(!value.allowed) this.revoke();
      return this.allowed();
    } catch {
      if(this.disposed || generation!==this.generation) return false;
      this.suspend();this.revoke();return false;
    }
  }
  dispose() {this.disposed=true;this.suspend();this.stop();}
}
