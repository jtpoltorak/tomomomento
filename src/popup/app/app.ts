import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { thoughtsText } from '../../shared/parking';
import { INSTALL_PROMPT } from './install-prompt';
import { PomodoroStore } from './pomodoro-store';
import { HelpView } from './help-view/help-view';
import { ParkingView } from './parking-view/parking-view';
import { PlanView } from './plan-view/plan-view';
import { SettingsView } from './settings-view/settings-view';
import { StatsView } from './stats-view/stats-view';
import { BigTimer } from './big-timer/big-timer';
import { applyA11y, applyTheme } from './theme';
import { TimerView } from './timer-view/timer-view';
import { WrapUpView } from './wrap-up-view/wrap-up-view';

type View = 'timer' | 'settings' | 'help' | 'stats' | 'plan' | 'parking' | 'wrapup' | 'big';

const TITLES: Record<Exclude<View, 'timer' | 'big'>, string> = {
  settings: 'Settings',
  help: 'Help',
  stats: 'Stats',
  plan: "Today's plan",
  parking: 'Parking lot',
  wrapup: 'Wrap up your day',
};

@Component({
  selector: 'app-root',
  imports: [
    BigTimer,
    TimerView,
    SettingsView,
    HelpView,
    StatsView,
    PlanView,
    ParkingView,
    WrapUpView,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly store = inject(PomodoroStore);
  protected readonly installPrompt = inject(INSTALL_PROMPT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  // The Options page links here with #settings, and the popup opens #big in a tab.
  protected readonly view = signal<View>(
    location.hash === '#settings' ? 'settings' : location.hash === '#big' ? 'big' : 'timer',
  );
  protected readonly title = computed(() => {
    const view = this.view();
    return view === 'timer' || view === 'big' ? '' : TITLES[view];
  });

  constructor() {
    // Phase colors are CSS variables keyed off <html data-phase>.
    effect(() => {
      document.documentElement.dataset['phase'] = this.store.state().phase;
    });
    effect(() => {
      if (this.store.loaded()) applyTheme(this.store.settings().theme);
    });
    effect(() => {
      if (this.store.loaded()) applyA11y(this.store.settings());
    });
  }

  /** "Parking lot, 3 thoughts". */
  protected readonly parkingLabel = computed(() => {
    const n = this.store.parkedCount();
    return n === 0 ? 'Parking lot' : `Parking lot, ${thoughtsText(n)}`;
  });

  /** The extension popup is too small for it, so there it opens in a tab. */
  protected async openBig(): Promise<void> {
    if (!(await this.store.openBigTimer())) this.show('big');
  }

  protected closeBig(): void {
    if (location.hash === '#big') history.replaceState(null, '', location.pathname);
    this.show('timer');
  }

  protected show(view: View): void {
    const from = this.view();
    this.view.set(view);
    // Move keyboard and screen reader focus along with the view: to the new
    // screen's heading, or back to the button that opened it.
    afterNextRender(
      () => {
        const el = this.host.nativeElement;
        // The big timer moves focus to its own button.
        if (view === 'big') return;
        const target =
          view === 'timer'
            ? // The card that opened the view may be gone by now (the day wrap-up), so fall back to Start.
              (el.querySelector<HTMLElement>(`[data-view="${from}"]`) ??
              el.querySelector<HTMLElement>('.primary-btn'))
            : // The parking lot is for getting a thought down fast, so go straight to the box.
              el.querySelector<HTMLElement>(view === 'parking' ? '#thought' : 'h1');
        target?.focus();
      },
      { injector: this.injector },
    );
  }
}
