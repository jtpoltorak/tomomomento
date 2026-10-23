/**
 * Settings search: hides the settings that don't mention every word typed.
 * Works on the rendered page, a group at a time: a switch with its note and
 * sub-options is one group. A section whose heading matches shows in full.
 * Returns how many groups are showing.
 */
export function filterSettings(root: HTMLElement, query: string): number {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const section of Array.from(root.querySelectorAll<HTMLElement>('form > section'))) {
    const groups = settingGroups(section);
    const heading = normalize(section.querySelector('h2')?.textContent ?? '');
    const whole = words.every((w) => heading.includes(w));
    let any = false;
    for (const group of groups) {
      const text = heading + ' ' + normalize(group.map((el) => el.textContent ?? '').join(' '));
      const match = whole || words.every((w) => text.includes(w));
      for (const el of group) el.hidden = !match;
      if (match) {
        any = true;
        shown++;
      }
    }
    section.hidden = !any;
    // A heading inside a group (Appearance's theme picker) stays, to name what's showing.
    const titled = groups.find((g) => g[0].querySelector('h2'));
    if (any && titled) for (const el of titled) el.hidden = false;
  }
  return shown;
}

/** A section's children, grouped: each starts a new group except notes and sub-options. */
function settingGroups(section: HTMLElement): HTMLElement[][] {
  const groups: HTMLElement[][] = [];
  for (const child of Array.from(section.children) as HTMLElement[]) {
    if (child.tagName === 'H2') continue;
    const follows = child.matches('.note, .sub-options') && groups.length > 0;
    if (follows) groups[groups.length - 1].push(child);
    else groups.push([child]);
  }
  return groups;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
}
