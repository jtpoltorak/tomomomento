import { TestBed } from '@angular/core/testing';
import { VisualTimer, wedgePath } from './visual-timer';

describe('VisualTimer', () => {
  it('draws the time left as a wedge from twelve o’clock', () => {
    expect(wedgePath(0)).toBeNull();
    expect(wedgePath(0.25)).toBe('M0 0L0 -1A1 1 0 0 0 -1 0Z');
    expect(wedgePath(0.75)).toBe('M0 0L0 -1A1 1 0 1 0 1 0Z');
  });

  it('shows a whole disc at the start and nothing left at the end', async () => {
    const fixture = TestBed.createComponent(VisualTimer);
    fixture.componentRef.setInput('left', 1);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('circle.left')).toBeTruthy();
    fixture.componentRef.setInput('left', 0.5);
    await fixture.whenStable();
    expect(el.querySelector('path.left')).toBeTruthy();
    fixture.componentRef.setInput('left', 0);
    await fixture.whenStable();
    expect(el.querySelector('.left')).toBeNull();
  });
});
