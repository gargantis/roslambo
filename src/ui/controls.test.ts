import { describe, expect, it } from 'vitest';
import { LEFT, RIGHT, THRUST } from '../core/sim/rules';
import { Controls } from './controls';

describe('controls (PLAN §11)', () => {
  it('reports keys held together, by physical position', () => {
    const c = new Controls();
    expect(c.keyDown('KeyW')).toBe(true);
    expect(c.keyDown('KeyA')).toBe(true);
    expect(c.keyDown('KeyQ')).toBe(false);
    expect(c.sample()).toBe(THRUST | LEFT);
    c.keyUp('KeyW');
    expect(c.sample()).toBe(LEFT);
  });

  it('counts a tap shorter than a tick once, at the next sample', () => {
    const c = new Controls();
    c.keyDown('KeyD');
    c.keyUp('KeyD');
    expect(c.sample()).toBe(RIGHT);
    expect(c.sample()).toBe(0);
  });

  it('holds each touch point separately, so two fingers on two buttons both count', () => {
    const c = new Controls();
    c.pointerDown(1, THRUST);
    c.pointerDown(2, LEFT);
    expect(c.sample()).toBe(THRUST | LEFT);
    c.pointerUp(2);
    expect(c.sample()).toBe(THRUST);
    c.pointerUp(1);
    expect(c.sample()).toBe(0);
  });

  it('keeps a button held while another finger on it lifts', () => {
    const c = new Controls();
    c.pointerDown(1, THRUST);
    c.pointerDown(2, THRUST);
    c.pointerUp(1);
    expect(c.held()).toBe(THRUST);
  });

  it('ignores key repeats, and releases everything on blur', () => {
    const c = new Controls();
    c.keyDown('KeyW');
    c.sample();
    c.keyDown('KeyW'); // a repeat
    c.pointerDown(5, RIGHT);
    c.releaseAll();
    expect(c.held()).toBe(0);
    expect(c.sample()).toBe(RIGHT); // the press before the blur still counts once
    expect(c.sample()).toBe(0);
  });
});
