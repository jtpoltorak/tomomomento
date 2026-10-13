import { TestBed } from '@angular/core/testing';
import { createFakeStore, provideFakeStore } from '../testing';
import { PLATFORM, type PlatformKind } from '../timer-host';
import { SettingsView } from './settings-view';

describe('SettingsView', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function setup(platform: PlatformKind = 'extension') {
    const store = createFakeStore();
    TestBed.configureTestingModule({
      imports: [SettingsView],
      providers: [provideFakeStore(store), { provide: PLATFORM, useValue: platform }],
    });
    const fixture = TestBed.createComponent(SettingsView);
    fixture.detectChanges();
    return { store, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('starts from the classic defaults with alerts off', async () => {
    const { el } = await setup();
    expect((el.querySelector('#workMinutes') as HTMLInputElement).value).toBe('25');
    expect((el.querySelector('#shortBreakMinutes') as HTMLInputElement).value).toBe('5');
    expect((el.querySelector('#longBreakMinutes') as HTMLInputElement).value).toBe('15');
    const switches = Array.from(el.querySelectorAll<HTMLInputElement>('input[role=switch]'));
    expect(switches.every((s) => !s.checked)).toBe(true);
    expect(el.querySelector('#sound')).toBeNull();
  });

  it('saves changes automatically, including the stepper buttons', async () => {
    const { store, el, fixture } = await setup();
    (el.querySelector('[aria-label="Increase Focus"]') as HTMLButtonElement).click();
    vi.advanceTimersByTime(400);
    await fixture.whenStable();
    expect(store.settings().workMinutes).toBe(26);
  });

  it('picks a theme, starting from the system one', async () => {
    const { store, el, fixture } = await setup();
    const radios = Array.from(el.querySelectorAll<HTMLInputElement>('.theme input[type=radio]'));
    expect(radios.map((r) => r.parentElement?.textContent?.trim())).toEqual([
      'System',
      'Light',
      'Dark',
    ]);
    expect(radios[0].checked).toBe(true);
    radios[2].click();
    vi.advanceTimersByTime(400);
    await fixture.whenStable();
    expect(store.settings().theme).toBe('dark');
  });

  it('reveals sound options when sound is turned on', async () => {
    const { store, el, fixture } = await setup();
    const soundSwitch = el.querySelector<HTMLInputElement>('input[formcontrolname=soundEnabled]')!;
    soundSwitch.click();
    fixture.detectChanges();
    expect(el.querySelector('#sound')).toBeTruthy();
    vi.advanceTimersByTime(400);
    await fixture.whenStable();
    expect(store.settings().soundEnabled).toBe(true);
  });

  describe('site blocker', () => {
    const blockerSwitch = (el: HTMLElement) =>
      el.querySelector<HTMLInputElement>('input[role=switch]:not([formcontrolname])')!;

    it('is off by default with the site list hidden', async () => {
      const { el } = await setup();
      expect(blockerSwitch(el).checked).toBe(false);
      expect(el.querySelector('.sites')).toBeNull();
    });

    it('asks for access, then turns on with suggested sites', async () => {
      const { store, el, fixture } = await setup();
      blockerSwitch(el).click();
      await vi.advanceTimersByTimeAsync(400);
      fixture.detectChanges();
      expect(blockerSwitch(el).checked).toBe(true);
      expect(store.settings().blockSites).toBe(true);
      expect(store.settings().blockedSites).toContain('youtube.com');
      expect(el.querySelectorAll('.sites li').length).toBe(store.settings().blockedSites.length);
    });

    it('stays off when access is denied', async () => {
      const { store, el, fixture } = await setup();
      store.grantBlockerAccess = false;
      blockerSwitch(el).click();
      await vi.advanceTimersByTimeAsync(400);
      fixture.detectChanges();
      expect(blockerSwitch(el).checked).toBe(false);
      expect(store.settings().blockSites).toBe(false);
    });

    it('adds typed sites as bare domains and removes them', async () => {
      const { store, el, fixture } = await setup();
      blockerSwitch(el).click();
      await vi.advanceTimersByTimeAsync(400);
      fixture.detectChanges();

      const input = el.querySelector<HTMLInputElement>('#newSite')!;
      input.value = 'https://www.News.com/today';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await vi.advanceTimersByTimeAsync(400);
      fixture.detectChanges();
      expect(store.settings().blockedSites).toContain('news.com');
      expect(input.value).toBe('');

      input.value = 'not a site';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges();
      expect(el.querySelector('.error')?.textContent).toContain("doesn't look like a website");

      el.querySelector<HTMLButtonElement>('[aria-label="Unblock news.com"]')!.click();
      await vi.advanceTimersByTimeAsync(400);
      expect(store.settings().blockedSites).not.toContain('news.com');
    });
  });

  describe('notifications', () => {
    const notifySwitch = (el: HTMLElement) =>
      el.querySelector<HTMLInputElement>('input[formcontrolname=notificationsEnabled]')!;

    it('turn on when the browser allows them', async () => {
      const { store, el } = await setup('web');
      notifySwitch(el).click();
      await vi.advanceTimersByTimeAsync(400);
      expect(store.settings().notificationsEnabled).toBe(true);
    });

    it('switch back off and explain when the browser blocks them', async () => {
      const { store, el, fixture } = await setup('web');
      store.grantNotificationAccess = false;
      notifySwitch(el).click();
      await vi.advanceTimersByTimeAsync(400);
      fixture.detectChanges();
      expect(notifySwitch(el).checked).toBe(false);
      expect(store.settings().notificationsEnabled).toBe(false);
      expect(el.querySelector('.error')?.textContent).toContain('blocked notifications');
    });
  });

  it('explains that the web app has no site blocker', async () => {
    const { el } = await setup('web');
    expect(el.querySelector('input[role=switch]:not([formcontrolname])')).toBeNull();
    expect(el.textContent).toContain('needs the Tomomomento Chrome extension');
  });

  it('turns on planning, with the daily card on by default', async () => {
    const { store, el, fixture } = await setup();
    expect(el.querySelector('input[formcontrolname=planPrompt]')).toBeNull();
    el.querySelector<HTMLInputElement>('input[formcontrolname=planEnabled]')!.click();
    fixture.detectChanges();
    const prompt = el.querySelector<HTMLInputElement>('input[formcontrolname=planPrompt]')!;
    expect(prompt.checked).toBe(true);
    vi.advanceTimersByTime(400);
    await fixture.whenStable();
    expect(store.settings().planEnabled).toBe(true);
    expect(store.settings().planPrompt).toBe(true);
  });
});
