import {
  setCurrentColour,
  getCurrentColour,
  subscribeCurrentColour,
  resetCurrentColour,
  CurrentColour,
} from '../currentColour';

const SAMPLE: CurrentColour = { rgb: [200, 180, 160], hex: '#C8B4A0', name: 'Warm Beige' };

describe('currentColour store', () => {
  beforeEach(() => resetCurrentColour());

  it('starts empty and returns what was set', () => {
    expect(getCurrentColour()).toBeNull();
    setCurrentColour(SAMPLE);
    expect(getCurrentColour()).toEqual(SAMPLE);
  });

  it('last write wins', () => {
    setCurrentColour(SAMPLE);
    const next: CurrentColour = { rgb: [21, 101, 192], hex: '#1565C0', name: 'Ocean Blue' };
    setCurrentColour(next);
    expect(getCurrentColour()).toEqual(next);
  });

  it('notifies subscribers on set and reset', () => {
    const calls: (CurrentColour | null)[] = [];
    const unsub = subscribeCurrentColour(() => calls.push(getCurrentColour()));
    setCurrentColour(SAMPLE);
    resetCurrentColour();
    expect(calls).toEqual([SAMPLE, null]);
    unsub();
  });

  it('stops notifying after unsubscribe', () => {
    let count = 0;
    const unsub = subscribeCurrentColour(() => count++);
    setCurrentColour(SAMPLE);
    unsub();
    setCurrentColour({ ...SAMPLE, name: 'Again' });
    expect(count).toBe(1);
  });

  it('supports multiple independent subscribers', () => {
    let a = 0;
    let b = 0;
    const unsubA = subscribeCurrentColour(() => a++);
    const unsubB = subscribeCurrentColour(() => b++);
    setCurrentColour(SAMPLE);
    unsubA();
    setCurrentColour({ ...SAMPLE, name: 'Second' });
    expect(a).toBe(1);
    expect(b).toBe(2);
    unsubB();
  });
});
