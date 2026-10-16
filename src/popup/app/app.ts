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
import { applyA11y, applyTheme } from './theme';
import { TimerView } from './timer-view/timer-view';

type View = 'timer' | 'settings' | 'help' | 'stats' | 'plan' | 'parking';

const TITLES: Record<Exclude<View, 'timer'>, string> = {
  settings: 'Settings',
  help: 'Help',
  stats: 'Stats',
  plan: "Today's plan",
  parking: 'Parking lot',
};

@Component({
  selector: 'app-root',
  imports: [TimerView, SettingsView, HelpView, StatsView, PlanView, ParkingView],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly store = inject(PomodoroStore);
  protected readonly installPrompt = inject(INSTALL_PROMPT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  // The Options page links here with #settings.
  protected readonly view = signal<View>(location.hash === '#settings' ? 'settings' : 'timer');
  protected readonly title = computed(() => {
    const view = this.view();
    return view === 'timer' ? '' : TITLES[view];
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

  protected show(view: View): void {
    const from = this.view();
    this.view.set(view);
    // Move keyboard and screen reader focus along with the view: to the new
    // screen's heading, or back to the button that opened it.
    afterNextRender(
      () => {
        const el = this.host.nativeElement;
        const target =
          view === 'timer'
            ? el.querySelector<HTMLElement>(`[data-view="${from}"]`)
            : // The parking lot is for getting a thought down fast, so go straight to the box.
              el.querySelector<HTMLElement>(view === 'parking' ? '#thought' : 'h1');
        target?.focus();
      },
      { injector: this.injector },
    );
  }
}
