import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime } from 'rxjs';
import { MAX_BLOCKED_SITES, normalizeSite, SUGGESTED_SITES } from '../../../shared/blocker';
import { playSound } from '../../../shared/sounds';
import {
  DEFAULT_SETTINGS,
  sanitizeSettings,
  SOUND_LABELS,
  THEME_LABELS,
  type Settings,
  type SoundId,
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
  protected readonly themes = Object.entries(THEME_LABELS) as [ThemeId, string][];
  protected readonly saved = signal(false);

  // The blocker lives outside the form because turning it on waits on Chrome's permission prompt.
  protected readonly blockSites = signal(this.store.settings().blockSites);
  protected readonly blockedSites = signal(this.store.settings().blockedSites);
  protected readonly blockerOn = computed(() => this.blockSites() && this.store.blockerAccess());
  protected readonly siteError = signal('');
  protected readonly notificationError = signal('');
  private savedTimer: ReturnType<typeof setTimeout> | undefined;

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
  });

  constructor() {
    this.form.setValue(this.toForm(this.store.settings()), { emitEvent: false });

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.savedTimer);
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

  protected restoreDefaults(): void {
    this.blockSites.set(DEFAULT_SETTINGS.blockSites);
    this.blockedSites.set(DEFAULT_SETTINGS.blockedSites);
    this.siteError.set('');
    this.form.setValue(this.toForm(DEFAULT_SETTINGS));
  }

  private toForm(s: Settings) {
    const { volume, blockSites, blockedSites, ...rest } = s;
    return { ...rest, volumePercent: Math.round(volume * 100) };
  }

  private fromForm(): Settings {
    const { volumePercent, ...rest } = this.form.getRawValue();
    return sanitizeSettings({
      ...rest,
      volume: volumePercent / 100,
      blockSites: this.blockSites(),
      blockedSites: this.blockedSites(),
    });
  }
}
