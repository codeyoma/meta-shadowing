export type MonitorStatus = {
  state: 'off' | 'requesting' | 'monitoring' | 'blocked' | 'denied' | 'failed';
  input: 'headset' | 'builtIn' | null;
  output: 'headphones' | 'unsupported' | 'none';
  permission?: 'undetermined' | 'denied' | 'granted';
  invalidationVersion?: number;
  gain: number;
  sampleRate: number | null;
  bufferSeconds: number | null;
  inputLatencySeconds: number | null;
  outputLatencySeconds: number | null;
};

type MonitorPort = { enableMonitor(): Promise<unknown>; disableMonitor(): Promise<void>;
  monitorStatus?(): Promise<MonitorStatus> };
type AutomaticContext = { foreground: boolean; eligible: boolean };
type AudioLease = { suspend(): Promise<void>; restore(): Promise<void> };
type MonitorNavigationState = {
  index?: number;
  routes: readonly { name: string; state?: MonitorNavigationState }[];
};

/** Session ownership only. Native code independently guards permission and routes. */
export class VoiceMonitorLab {
  private acquiring?: Promise<void>;
  private closing?: Promise<void>;
  private owned = false;
  private closed = false;
  private observedHome = false;
  private generation = 0;
  private connected?: boolean;
  private autoAttempted = false;
  private autoSuppressed = false;
  private permissionRetry = false;
  private permissionRetryVersion?: number;
  private automatic?: { status: MonitorStatus; context: AutomaticContext };
  constructor(private readonly monitor: MonitorPort, private readonly lease: AudioLease, private readonly supported: boolean,
    private readonly homeRoute: 'monitoring-lab' | 'player' = 'monitoring-lab') {}

  get available() { return !this.closed; }

  async preparePlayback(configure: () => Promise<void>): Promise<void> {
    await this.open();
    if (this.closed) throw Error('Monitoring session has ended.');
    await configure();
  }

  open(): Promise<void> {
    if (!this.supported) return Promise.reject(Error('Voice monitoring is unavailable.'));
    if (this.closed) return Promise.resolve();
    return this.acquiring ??= (async () => {
      // A failed suspend may still have partially changed the shared session.
      this.owned = true;
      await this.lease.suspend();
    })();
  }

  async enable(): Promise<void> {
    this.autoAttempted = true;
    this.permissionRetry = false;
    const request = ++this.generation;
    await this.open();
    if (this.closed || request !== this.generation) return;
    await this.monitor.enableMonitor();
  }

  async disable(): Promise<void> {
    this.autoSuppressed = true;
    this.permissionRetry = false;
    ++this.generation;
    if (this.supported) await this.monitor.disableMonitor();
  }

  /** One automatic attempt per wired connection. Native remains the route/permission authority. */
  async automaticChanged(status: MonitorStatus, context: AutomaticContext): Promise<void> {
    if (this.permissionRetry && status.invalidationVersion !== this.permissionRetryVersion) this.permissionRetry = false;
    this.automatic = { status, context };
    const connected = status.output === 'headphones';
    if (this.connected === true && !connected) {
      ++this.generation;
      this.autoAttempted = false;
      this.autoSuppressed = false;
      this.permissionRetry = false;
    }
    this.connected = connected;
    if (!this.canStartAutomatically() || (this.autoAttempted && !this.permissionRetry)) return;
    if (status.state === 'monitoring' || status.state === 'requesting') {
      this.autoAttempted = true;
      return;
    }
    this.autoAttempted = true;
    this.permissionRetry = false;
    const request = ++this.generation;
    await this.open();
    if (request !== this.generation || this.closed) return;
    if (this.automatic?.status.invalidationVersion !== status.invalidationVersion) return;
    if (!this.canStartAutomatically()) {
      // Nothing reached native yet. A temporary readiness/foreground change
      // must defer this attempt, not consume the connection's only start.
      this.autoAttempted = false;
      return;
    }
    await this.monitor.enableMonitor();
    // The system permission sheet makes the app inactive, so native cancels its
    // pending start. Only that first grant may retry, never an interruption/error.
    if (status.permission !== 'undetermined' || request !== this.generation || this.closed) return;
    const result = await this.monitor.monitorStatus?.();
    if (request !== this.generation || this.closed || !result) return;
    if (result.permission === 'granted' && result.state === 'off'
      && result.invalidationVersion === status.invalidationVersion
      && this.automatic?.status.invalidationVersion === status.invalidationVersion) {
      this.permissionRetry = true;
      this.permissionRetryVersion = result.invalidationVersion;
      await this.automaticChanged(result, this.automatic!.context);
    }
  }

  private canStartAutomatically(): boolean {
    const current = this.automatic;
    return this.supported && this.homeRoute === 'player' && this.observedHome && !this.closed
      && !this.autoSuppressed && !!current?.context.foreground && current.context.eligible
      && current.status.output === 'headphones'
      && (current.status.permission === 'granted' || current.status.permission === 'undetermined');
  }

  async learningChanged(state: MonitorNavigationState, access: { blocked: boolean; complete: boolean }): Promise<void> {
    if (access.complete) { await this.close(); return; }
    await this.navigationChanged(state);
    // A recoverable access failure clears microphone intent, not the lesson's
    // playback lease. Recovery can play normally but never re-enables capture.
    if (this.available && access.blocked) await this.disable();
  }

  async navigationChanged(state: MonitorNavigationState): Promise<void> {
    let active = state.routes[state.index ?? 0];
    // Expo's root navigator contains an internal wrapper, not an app screen.
    // Only unwrap that shell: a tab's nested route still means lab exit.
    while (active?.name === '__root') {
      if (!active.state) return; // Child navigation has not initialized yet.
      active = active.state.routes[active.state.index ?? 0];
    }
    if (!active) return;
    if (active.name === this.homeRoute) {
      this.observedHome = true;
      return;
    }
    // A newly mounted screen may receive the previous navigator snapshot
    // before Expo's parent layout effect publishes this screen's route.
    // Actual removal still closes explicitly via beforeRemove/unmount.
    if (!this.observedHome) return;
    // Temporary root-stack sheets don't end the underlying monitoring session.
    if (['player-options', 'player-info', 'languages'].includes(active.name)) return;
    await this.close();
  }

  close(): Promise<void> {
    this.closed = true;
    ++this.generation;
    if (this.closing) return this.closing;
    this.closing = (async () => {
      if (!this.owned) return;
      // Do not wait for the permission dialog: invalidate native intent first.
      await this.monitor.disableMonitor();
      await this.acquiring?.catch(() => {});
      await this.lease.restore();
      this.owned = false;
    })().finally(() => { this.closing = undefined; });
    return this.closing;
  }
}

export function monitorPresentation(supported: boolean, state: MonitorStatus['state'], output: MonitorStatus['output'], appearance: 'full' | 'compact' = 'full') {
  const compact = appearance === 'compact';
  const message = compact
    ? !supported ? '음성 모니터링을 지원하는 앱으로 업데이트해 주세요.'
      : state === 'denied' ? '마이크 권한을 허용해 주세요.'
      : state === 'failed' ? '연결을 확인하고 다시 켜 주세요.'
      : '유선이어폰 사용시 실시간으로 내 목소리를 모니터링 할 수 있어요'
    : !supported ? '음성 모니터링을 지원하는 앱으로 업데이트해 주세요.'
    : state === 'denied' ? '설정에서 마이크 접근을 허용한 뒤 다시 켜 주세요.'
    : output !== 'headphones' ? '유선 헤드폰으로 확인된 이어폰만 지원해요. Bluetooth·일반 USB 출력은 사용할 수 없어요.'
    : state === 'failed' ? '오디오를 시작하지 못했어요. 연결을 확인한 뒤 다시 켜 주세요.'
    : state === 'requesting' ? '마이크 권한을 확인하고 있어요.'
    : state === 'monitoring' ? '내 목소리를 듣고 있어요. 음성은 저장하거나 전송하지 않아요.'
    : '낮은 음량으로 시작하세요. 중단 후에는 직접 다시 켜 주세요.';
  return { available: supported, message,
    canEnable: supported && output === 'headphones' && state !== 'requesting',
    canPlay: supported && output === 'headphones' && state === 'monitoring' };
}
