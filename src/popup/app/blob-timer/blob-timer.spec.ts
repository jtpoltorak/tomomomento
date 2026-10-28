import { TestBed } from '@angular/core/testing';
import { BLOB_SPEEDS, BlobTimer, dotCount, filledDots, gridSize } from './blob-timer';

describe('BlobTimer', () => {
  it('draws one dot a minute, up to 64, in a near-square grid', () => {
    expect(dotCount(25)).toBe(25);
    expect(dotCount(5)).toBe(5);
    expect(dotCount(0)).toBe(1);
    expect(dotCount(90)).toBe(45); // two minutes a dot
    expect(dotCount(180)).toBe(60); // three minutes a dot
    expect(gridSize(25)).toEqual({ cols: 5, rows: 5 });
    expect(gridSize(5)).toEqual({ cols: 3, rows: 2 });
    expect(gridSize(15)).toEqual({ cols: 4, rows: 4 });
  });

  it('fills a dot for each finished minute', () => {
    expect(filledDots(0, 25)).toBe(0);
    expect(filledDots(0.039, 25)).toBe(0);
    expect(filledDots(0.04, 25)).toBe(1);
    expect(filledDots(0.5, 25)).toBe(12);
    expect(filledDots(1, 25)).toBe(25);
  });

  it('only gets faster than Gentle', () => {
    const paces = Object.values(BLOB_SPEEDS);
    expect(paces[0]).toBe(1);
    expect(paces).toEqual([...paces].sort((a, b) => a - b));
  });

  it('draws filled and empty dots in their own groups, and holds still when asked', async () => {
    const fixture = TestBed.createComponent(BlobTimer);
    fixture.componentRef.setInput('progress', 0.4);
    fixture.componentRef.setInput('minutes', 25);
    fixture.componentRef.setInput('still', true);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelectorAll('.fill circle').length).toBe(10);
    expect(el.querySelectorAll('.empty circle').length).toBe(15);

    fixture.componentRef.setInput('blobStyle', 'mosaic');
    await fixture.whenStable();
    expect(el.querySelectorAll('.fill circle').length).toBe(0);
    expect(el.querySelectorAll('.k0 circle, .k1 circle, .k2 circle').length).toBe(10);

    fixture.componentRef.setInput('blobStyle', 'drift');
    await fixture.whenStable();
    expect(el.querySelectorAll('.fill circle').length).toBe(9);
    expect(el.querySelector('.empty')).toBeNull();
  });
});
