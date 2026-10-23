import { TestBed } from '@angular/core/testing';
import { ABOUT } from '../../../shared/about';
import { PLATFORM } from '../timer-host';
import { HelpView } from './help-view';

describe('HelpView', () => {
  function setup(platform: 'extension' | 'web' = 'extension') {
    TestBed.configureTestingModule({
      imports: [HelpView],
      providers: [{ provide: PLATFORM, useValue: platform }],
    });
    fixture = TestBed.createComponent(HelpView);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  let fixture: ReturnType<typeof TestBed.createComponent<HelpView>>;

  async function openTab(el: HTMLElement, name: string) {
    const tab = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
      (t) => t.textContent?.trim() === name,
    )!;
    tab.click();
    await fixture.whenStable();
  }

  it('splits the help into tabs, starting with the basics', () => {
    const el = setup();
    const tabs = Array.from(el.querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => t.textContent?.trim())).toEqual([
      'Basics',
      'Tips',
      'Technique',
      'About',
    ]);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    const panel = el.querySelector('[role="tabpanel"]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id);
    expect(el.querySelectorAll('.steps li').length).toBe(3);
  });

  it('moves between tabs with the arrow keys', async () => {
    const el = setup();
    const tablist = el.querySelector('[role="tablist"]')!;
    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await fixture.whenStable();
    const selected = el.querySelector('[role="tab"][aria-selected="true"]')!;
    expect(selected.textContent?.trim()).toBe('About');
    expect(selected.getAttribute('tabindex')).toBe('0');
    expect(el.querySelector('a[href^="mailto:"]')).not.toBeNull();
  });

  it('lists the keyboard shortcuts under Tips', async () => {
    const el = setup();
    await openTab(el, 'Tips');
    expect(el.textContent).toContain('Alt+Shift+P');
  });

  it('explains the technique', async () => {
    const el = setup();
    await openTab(el, 'Technique');
    const topics = Array.from(el.querySelectorAll('h3')).map((s) => s.textContent);
    expect(topics).toEqual(['What it is', 'Who invented it', 'Why it works']);
    expect(el.textContent).toContain('Francesco Cirillo');
    expect(el.querySelector('.trademark')?.textContent).toContain("isn't affiliated");
  });

  it('links to the contact address and the legal page', async () => {
    const el = setup();
    await openTab(el, 'About');
    const mail = el.querySelector<HTMLAnchorElement>('a[href^="mailto:"]')!;
    expect(mail.textContent).toBe(ABOUT.email);
    const legal = Array.from(el.querySelectorAll<HTMLAnchorElement>('nav a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(legal).toEqual(['legal.html#privacy', 'legal.html#terms', 'legal.html#credits']);
    expect(el.querySelector('.fine')?.textContent).toContain(`© ${ABOUT.copyrightYear}`);
  });

  it('describes the web app without extension-only features', async () => {
    const el = setup('web');
    await openTab(el, 'Tips');
    expect(el.textContent).not.toContain('Alt+Shift+P');
    expect(el.textContent).not.toContain('site blocker');
    expect(el.textContent).toContain("tab's title shows the time left");
  });

  it('explains Settle in, First tiny step, Step away, Small wins, Energy check-in, Distraction tally, Weekly look-back, Take-care reminders, Just start, Rhythm presets, Heads-up, Paused reminder, Calm clock, Ends at, Keyboard shortcuts, Animated digits, Lava lamp, Minimal timer, Accessibility, Focus sound, Keep going, Stats, Plan my day, the parking lot, day wrap-up, right-click shortcuts, break ideas and backups in the basics', () => {
    const el = setup();
    const headings = Array.from(el.querySelectorAll('h3')).map((h) => h.textContent?.trim());
    expect(headings).toEqual([
      'Settle in',
      'First tiny step',
      'Step away',
      'Small wins',
      'Energy check-in',
      'Distraction tally',
      'Weekly look-back',
      'Take-care reminders',
      'Just start',
      'Rhythm presets',
      'Heads-up',
      'Paused reminder',
      'Calm clock',
      'Ends at',
      'Keyboard shortcuts',
      'Animated digits',
      'Lava lamp',
      'Minimal timer',
      'Accessibility',
      'Focus sound',
      'Keep going',
      'Stats',
      'Plan my day',
      'Parking lot',
      'Day wrap-up',
      'Right-click shortcuts',
      'Break ideas',
      'Back up and restore',
    ]);
    expect(el.querySelectorAll('.plan-steps li').length).toBe(3);
  });
});
