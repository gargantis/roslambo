"""Numerical checks for the roslambo pre-start ring and collision rules.

Reproduces the numbers in REQUIREMENTS.md, "Appendix: physics checks".
Plain Python 3, no dependencies: python3 ring_check.py

Units: G = m = R = 1 unless stated.
"""
import math

G = 1.0


def S(n):
    return 0.25 * sum(1 / math.sin(math.pi * k / n) for k in range(1, n))


def ring(n, R=1.0, m=1.0):
    v = math.sqrt(G * m * S(n) / R)
    pos, vel = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        pos.append([R * math.cos(a), R * math.sin(a)])
        # counter-clockwise rotation; planet i+1 is ahead of planet i
        vel.append([-v * math.sin(a), v * math.cos(a)])
    return pos, vel, v


def accel(pos, m=1.0):
    n = len(pos)
    acc = [[0.0, 0.0] for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            dx = pos[j][0] - pos[i][0]
            dy = pos[j][1] - pos[i][1]
            d2 = dx * dx + dy * dy
            f = G * m / (d2 * math.sqrt(d2))
            acc[i][0] += f * dx
            acc[i][1] += f * dy
    return acc


def simulate(n, perturb=1e-9, orbits=30, steps_per_orbit=4000):
    """Orbits until the ring's radius deviates by 0.1%, 1% and 10%."""
    pos, vel, v = ring(n)
    pos[0][0] += perturb  # tiny nudge, standing in for rounding error
    period = 2 * math.pi / v
    dt = period / steps_per_orbit
    acc = accel(pos)
    first = {}
    for step in range(1, orbits * steps_per_orbit + 1):
        for i in range(n):  # velocity Verlet
            vel[i][0] += 0.5 * dt * acc[i][0]
            vel[i][1] += 0.5 * dt * acc[i][1]
            pos[i][0] += dt * vel[i][0]
            pos[i][1] += dt * vel[i][1]
        acc = accel(pos)
        for i in range(n):
            vel[i][0] += 0.5 * dt * acc[i][0]
            vel[i][1] += 0.5 * dt * acc[i][1]
        cx = sum(p[0] for p in pos) / n
        cy = sum(p[1] for p in pos) / n
        dev = max(abs(math.hypot(p[0] - cx, p[1] - cy) - 1.0) for p in pos)
        for thresh in (1e-3, 1e-2, 1e-1):
            if thresh not in first and dev > thresh:
                first[thresh] = step / steps_per_orbit
        if 1e-1 in first:
            break
    return first


def pair_bounces(e, r=0.05, gap=0.1, seconds=3.0, dt=1e-4):
    """Two planets released at rest, surface gap `gap`, mutual gravity,
    restitution e. Counts contact events (approach -> touch)."""
    x1, x2 = -(r + gap / 2), r + gap / 2
    v1 = v2 = 0.0
    bounces = 0
    t = 0.0
    times = []
    while t < seconds:
        d = x2 - x1
        a = G / (d * d)
        v1 += a * dt
        v2 -= a * dt
        x1 += v1 * dt
        x2 += v2 * dt
        if x2 - x1 <= 2 * r and v2 - v1 < 0:
            rel = v2 - v1
            # equal masses: exchange the relative velocity, scaled by e
            v1, v2 = (v1 + v2) / 2 + e * rel / 2, (v1 + v2) / 2 - e * rel / 2
            overlap = 2 * r - (x2 - x1)
            x1 -= overlap / 2
            x2 += overlap / 2
            bounces += 1
            times.append(t)
        t += dt
    return bounces, times


def main():
    print("1) Formula check: inward acceleration from a direct sum vs v^2/R")
    print(f"{'N':>3} {'S_N':>9} {'v':>8} {'direct':>10} {'v^2/R':>10} {'tangential':>11} {'period T':>9}")
    for n in range(1, 13):
        pos, vel, v = ring(n)
        a = accel(pos)[0]  # planet 0 sits at (R, 0): inward is -x, tangential is y
        period = 2 * math.pi / v if v > 0 else float("inf")
        print(f"{n:>3} {S(n):9.5f} {v:8.5f} {-a[0]:10.6f} {v * v:10.6f} {a[1]:11.1e} {period:9.3f}")

    print()
    print("Speed relative to a 3-planet ring (same G, m, R):")
    v3 = ring(3)[2]
    print("  " + ", ".join(f"N={n}: {ring(n)[2] / v3:.2f}x" for n in (3, 4, 5, 6, 8, 10, 12, 16, 20)))

    print()
    print("2) Stability without correction: orbits until the radius deviates by 0.1% / 1% / 10%")
    runs = [(n, 1e-9, 4000) for n in (3, 4, 5, 6, 8)]
    runs += [(3, 1e-9, 16000), (6, 1e-9, 16000)]  # finer timestep: same numbers
    runs += [(3, 0.0, 4000), (6, 0.0, 4000)]  # perfect ring: rounding error only
    for n, perturb, spo in runs:
        f = simulate(n, perturb=perturb, steps_per_orbit=spo)
        cells = " / ".join(f"{f[t]:.2f}" if t in f else ">30" for t in (1e-3, 1e-2, 1e-1))
        print(f"  N={n} nudge={perturb:g}R steps/orbit={spo}: {cells}")

    print()
    print("3) Geometric limit: N_max = floor(pi / asin((2r + c) / (2R)))")
    for r_over_R, c_over_R in ((0.05, 0.0), (0.05, 0.05), (0.08, 0.04), (0.1, 0.05)):
        x = (2 * r_over_R + c_over_R) / 2
        nmax = math.floor(math.pi / math.asin(x))
        ok = 2 * math.sin(math.pi / nmax) >= 2 * r_over_R + c_over_R
        bad = 2 * math.sin(math.pi / (nmax + 1)) >= 2 * r_over_R + c_over_R
        print(f"  r={r_over_R}R, clearance={c_over_R}R -> N_max={nmax}  (N_max fits: {ok}, N_max+1 fits: {bad})")

    print()
    print("4) Two planets released at rest near each other (gap 2r, G=m=1), 3 time units:")
    for e in (1.0, 0.9, 0.7, 0.5):
        n, times = pair_bounces(e)
        first = ", ".join(f"{t:.2f}" for t in times[:6])
        print(f"  restitution {e}: {n} contact events; first at t = {first} ...")


if __name__ == "__main__":
    main()
