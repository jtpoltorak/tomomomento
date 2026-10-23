import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime } from 'rxjs';
import { backupFileName, createBackup, parseBackup, type BackupData } from '../../../shared/backup';
import { MAX_BLOCKED_SITES, normalizeSite, SUGGESTED_SITES } from '../../../shared/blocker';
import { FocusSoundPlayer } from '../../../shared/focus-sounds';
import { WRAP_UP_HOUR } from '../../../shared/parking';
import { playSound } from '../../../shared/sounds';
import {
  AWAY_MS,
  CARE_EVERY,
  DEFAULT_SETTINGS,
  JUST_START_MINUTES,
  KEEP_GOING_MINUTES,
  PAUSE_NUDGE_MS,
  sanitizeSettings,
  SOUND_LABELS,
  THEME_LABELS,
  TEXT_SIZE_LABELS,
  type TextSizeId,
  type Settings,
  type SoundId,
  FOCUS_SOUND_LABELS,
  type FocusSoundId,
  type ThemeId,
} from '../../../shared/timer';
import { PomodoroStore } from '../pomodoro-store';
import { PLATFORM } from '../timer-host';

@Component({
  selector: 'app-settings-view',
  imports: [ReactiveFormsModule],
  templateUrl: './settings-view.html',
  styleUrl: './settings-view.css',
})
export class SettingsView {
  private readonly store = inject(PomodoroStore);
  private readonly fb = inject(FormBuilder).nonNullable;
  /** A web page can't redirect other sites, so the web app explains that instead. */
  protected readonly isWeb = inject(PLATFORM) === 'web';
  private audio?: AudioContext;

  protected readonly sounds = Object.entries(SOUND_LABELS) as [SoundId, string][];
  protected readonly focusSounds = Object.entries(FOCUS_SOUND_LABELS) as [FocusSoundId, string][];
  protected readonly themes = Object.entries(THEME_LABELS) as [ThemeId, string][];
  protected readonly textSizes = Object.entries(TEXT_SIZE_LABELS) as [TextSizeId, string][];
  protected readonly saved = signal(false);
  protected readonly justStartMinutes = JUST_START_MINUTES;
  protected readonly keepGoingMinutes = KEEP_GOING_MINUTES;
  protected readonly pauseNudgeMinutes = PAUSE_NUDGE_MS / 60_000;
  protected readonly awayMinutes = AWAY_MS / 60_000;
  protected readonly careEvery = CARE_EVERY;
  protected readonly wrapUpTime = `${WRAP_UP_HOUR - 12} pm`;

  // The blocker lives outside the form because turning it on waits on Chrome's permission prompt.
  protected readonly blockSites = signal(this.store.settings().blockSites);
  protected readonly blockedSites = signal(this.store.settings().blockedSites);
  protected readonly blockerOn = computed(() => this.blockSites() && this.store.blockerAccess());
  protected readonly siteError = signal('');
  protected readonly notificationError = signal('');
  private savedTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  // Back up and restore.
  protected readonly dataMessage = signal('');
  protected readonly dataError = signal('');
  protected readonly pendingRestore = signal<{ data: BackupData; date: string } | null>(null);

  protected readonly durations = [
    { key: 'workMinutes', label: 'Focus', max: 180 },
    { key: 'shortBreakMinutes', label: 'Short break', max: 60 },
    { key: 'longBreakMinutes', label: 'Long break', max: 120 },
  ] as const;

  protected readonly form = this.fb.group({
    workMinutes: [0, [Validators.required, Validators.min(1), Validators.max(180)]],
    shortBreakMinutes: [0, [Validators.required, Validators.min(1), Validators.max(60)]],
    longBreakMinutes: [0, [Validators.required, Validators.min(1), Validators.max(120)]],
    sessionsBeforeLongBreak: [0, [Validators.required, Validators.min(1), Validators.max(12)]],
    autoStartBreaks: [false],
    autoStartWork: [false],
    notificationsEnabled: [false],
    soundEnabled: [false],
    sound: ['bell' as SoundId],
    volumePercent: [70],
    theme: ['system' as ThemeId],
    showQuotes: [false],
    planEnabled: [false],
    planPrompt: [true],
    parkingLot: [false],
    dayWrapUp: [false],
    breakIdeas: [false],
    justStart: [false],
    keepGoing: [false],
    headsUp: [false],
    calmClock: [false],
    showEndsAt: [false],
    animateDigits: [false],
    minimalMode: [false],
    lavaLamp: [false],
    pauseNudge: [false],
    settleIn: [false],
    awayCheck: [false],
    rightClick: [false],
    takeCare: [false],
    smallWins: [false],
    firstStep: [false],
    energyCheck: [false],
    weeklyLookBack: [false],
    driftTally: [false],
    rhythmPresets: [false],
    focusSound: ['off' as FocusSoundId],
    focusVolumePercent: [40],
    highContrast: [false],
    colorSafe: [false],
    textSize: ['normal' as TextSizeId],
    easyFont: [false],
    reduceMotion: [false],
    shortcuts: [false],
  });

  constructor() {
    this.form.setValue(this.toForm(this.store.settings()), { emitEvent: false });

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.savedTimer);
      clearTimeout(this.focusPreviewTimer);
      void this.audio?.close();
    });

    // Changes save as you go, so there's no Save button to forget.
    this.form.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe(() => this.save());
  }

  private save(): void {
    if (this.form.invalid) return;
    void this.store.updateSettings(this.fromForm()).then(() => {
      this.saved.set(true);
      clearTimeout(this.savedTimer);
      this.savedTimer = setTimeout(() => this.saved.set(false), 1500);
    });
  }

  protected async toggleBlocker(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.checked) {
      // The background worker gives the site access back once this saves.
      this.blockSites.set(false);
      this.save();
      return;
    }
    input.checked = false; // stays off unless the user allows access
    if (!(await this.store.requestBlockerAccess())) return;
    if (this.blockedSites().length === 0) this.blockedSites.set(SUGGESTED_SITES);
    this.blockSites.set(true);
    this.save();
  }

  /** The web app needs the browser's permission before it can show notifications. */
  protected async toggleNotifications(event: Event): Promise<void> {
    this.notificationError.set('');
    if (!(event.target as HTMLInputElement).checked) return;
    if (await this.store.requestNotificationAccess()) return;
    this.form.controls.notificationsEnabled.setValue(false);
    this.notificationError.set(
      'Your browser blocked notifications for this site. Allow them in its site settings, then try again.',
    );
  }

  protected addSite(input: HTMLInputElement): void {
    const typed = input.value.trim();
    if (!typed) return;
    const site = normalizeSite(typed);
    if (!site) {
      this.siteError.set(`"${typed}" doesn't look like a website.`);
      return;
    }
    if (!this.blockedSites().includes(site)) {
      if (this.blockedSites().length >= MAX_BLOCKED_SITES) {
        this.siteError.set(`You can block up to ${MAX_BLOCKED_SITES} sites.`);
        return;
      }
      this.blockedSites.update((sites) => [...sites, site]);
      this.save();
    }
    input.value = '';
    this.siteError.set('');
  }

  protected removeSite(site: string): void {
    this.blockedSites.update((sites) => sites.filter((s) => s !== site));
    this.save();
  }

  protected step(
    key: 'workMinutes' | 'shortBreakMinutes' | 'longBreakMinutes' | 'sessionsBeforeLongBreak',
    delta: number,
  ): void {
    const control = this.form.controls[key];
    const next = sanitizeSettings({ ...this.fromForm(), [key]: (control.value || 0) + delta })[key];
    control.setValue(next);
  }

  protected async preview(): Promise<void> {
    this.audio ??= new AudioContext();
    await this.audio.resume();
    const { sound, volumePercent } = this.form.getRawValue();
    await playSound(this.audio, sound, volumePercent / 100);
  }

  private focusPreview: FocusSoundPlayer | undefined;
  private focusPreviewTimer: ReturnType<typeof setTimeout> | undefined;

  /** A few seconds of the focus sound, at the chosen volume. */
  protected async previewFocusSound(): Promise<void> {
    const { focusSound, focusVolumePercent } = this.form.getRawValue();
    if (focusSound === 'off') return;
    this.audio ??= new AudioContext();
    await this.audio.resume();
    this.focusPreview ??= new FocusSoundPlayer(this.audio);
    this.focusPreview.play(focusSound, focusVolumePercent / 100);
    clearTimeout(this.focusPreviewTimer);
    this.focusPreviewTimer = setTimeout(() => this.focusPreview?.stop(), 4000);
  }

  protected backUp(): void {
    const now = Date.now();
    const json = JSON.stringify(createBackup(this.store.backupData(), now), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName(now);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    this.dataError.set('');
    this.dataMessage.set(`Backed up to ${link.download}.`);
  }

  protected async chooseBackup(input: HTMLInputElement): Promise<void> {
    this.dataError.set('');
    this.dataMessage.set('');
    if (await this.store.needsTabForFiles()) {
      // The popup would close as soon as the file chooser opened.
      await this.store.openSettingsTab();
      window.close();
      return;
    }
    input.value = '';
    input.click();
  }

  protected async readBackup(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      this.dataError.set(parsed.error);
      return;
    }
    const date =
      parsed.exportedAt?.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }) ?? '';
    this.pendingRestore.set({ data: parsed.data, date });
    this.focus('.confirm .cancel');
  }

  protected cancelRestore(): void {
    this.pendingRestore.set(null);
    this.focus('.restore');
  }

  protected async confirmRestore(): Promise<void> {
    const pending = this.pendingRestore();
    if (!pending) return;
    this.pendingRestore.set(null);
    // Switches that need this browser's permission stay as they are here.
    const keep: (keyof Settings)[] = this.isWeb
      ? ['blockSites', 'notificationsEnabled']
      : ['blockSites'];
    const settings = await this.store.restoreBackup(pending.data, keep);
    this.form.setValue(this.toForm(settings), { emitEvent: false });
    this.blockSites.set(settings.blockSites);
    this.blockedSites.set(settings.blockedSites);
    this.dataMessage.set('Restored. Welcome back!');
    this.focus('.restore');
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }

  protected restoreDefaults(): void {
    this.blockSites.set(DEFAULT_SETTINGS.blockSites);
    this.blockedSites.set(DEFAULT_SETTINGS.blockedSites);
    this.siteError.set('');
    this.form.setValue(this.toForm(DEFAULT_SETTINGS));
  }

  private toForm(s: Settings) {
    const { volume, focusVolume, blockSites, blockedSites, ...rest } = s;
    return {
      ...rest,
      volumePercent: Math.round(volume * 100),
      focusVolumePercent: Math.round(focusVolume * 100),
    };
  }

  private fromForm(): Settings {
    const { volumePercent, focusVolumePercent, ...rest } = this.form.getRawValue();
    return sanitizeSettings({
      ...rest,
      volume: volumePercent / 100,
      focusVolume: focusVolumePercent / 100,
      blockSites: this.blockSites(),
      blockedSites: this.blockedSites(),
    });
  }
}
