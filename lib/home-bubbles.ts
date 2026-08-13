export type BubbleVisual = {
  id: string;
  term: string;
  size: number;
  redFactor: number;
  greenFactor: number;
  blueFactor: number;
  gradientAngle: number;
  preferredX: number;
  preferredY: number;
  speed: number;
  heading: number;
  wanderPhase: number;
  wanderRate: number;
};

export type BubbleParticle = BubbleVisual & {
  x: number;
  y: number;
  radius: number;
  mass: number;
  vx: number;
  vy: number;
  squash: number;
  squashAngle: number;
};

export type BubbleBounds = { width: number; height: number; padding: number };
export type BubbleRect = { left: number; top: number; right: number; bottom: number };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function bubbleCountForWidth(width: number) {
  return width <= 700 ? 4 : 6;
}

export function minimumBubbleSize(term: string, mobile = false) {
  const visibleLength = Array.from(term).reduce((length, character) => length + (/^[\x00-\xff]$/.test(character) ? 0.55 : 1), 0);
  const desktopMinimum = visibleLength > 6 ? 108 : visibleLength > 4 ? 96 : visibleLength > 2.5 ? 84 : 72;
  return mobile ? clamp(Math.round(desktopMinimum * 0.78), 62, 92) : desktopMinimum;
}

export function responsiveBubbleSize(visual: BubbleVisual, width: number) {
  if (width > 700) return visual.size;
  return clamp(Math.round(visual.size * 0.78), minimumBubbleSize(visual.term, true), 92);
}

export function createBubbleVisuals(terms: string[], random = Math.random) {
  return terms.map((term, index): BubbleVisual => {
    const minimum = minimumBubbleSize(term);
    const size = Math.round(minimum + random() * Math.max(1, 112 - minimum));
    const randomFactor = () => random() * 2 - 1;
    return {
      id: `${term}-${index}`,
      term,
      size,
      redFactor: randomFactor(),
      greenFactor: randomFactor(),
      blueFactor: randomFactor(),
      gradientAngle: Math.round(120 + random() * 60),
      preferredX: 0.06 + random() * 0.88,
      preferredY: 0.1 + random() * 0.82,
      speed: 3.8 + random() * 2.8,
      heading: random() * Math.PI * 2,
      wanderPhase: random() * Math.PI * 2,
      wanderRate: 0.18 + random() * 0.18,
    };
  });
}

function circleIntersectsRect(x: number, y: number, radius: number, rect: BubbleRect) {
  const nearestX = clamp(x, rect.left, rect.right);
  const nearestY = clamp(y, rect.top, rect.bottom);
  return Math.hypot(x - nearestX, y - nearestY) < radius;
}

export function placeBubbleParticles(
  visuals: BubbleVisual[],
  bounds: BubbleBounds,
  safeRect: BubbleRect,
  random = Math.random,
) {
  const particles: BubbleParticle[] = [];
  for (const visual of visuals.slice(0, bubbleCountForWidth(bounds.width))) {
    const size = responsiveBubbleSize(visual, bounds.width);
    const radius = size / 2;
    let x = clamp(visual.preferredX * bounds.width, radius + bounds.padding, bounds.width - radius - bounds.padding);
    let y = clamp(visual.preferredY * bounds.height, radius + bounds.padding, bounds.height - radius - bounds.padding);

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const overlapsCore = circleIntersectsRect(x, y, radius + 16, safeRect);
      const overlapsBubble = particles.some((particle) => Math.hypot(x - particle.x, y - particle.y) < radius + particle.radius + 10);
      if (!overlapsCore && !overlapsBubble) break;
      x = radius + bounds.padding + random() * Math.max(1, bounds.width - (radius + bounds.padding) * 2);
      y = radius + bounds.padding + random() * Math.max(1, bounds.height - (radius + bounds.padding) * 2);
    }

    const particle: BubbleParticle = {
      ...visual,
      size,
      x,
      y,
      radius,
      mass: radius * radius,
      vx: Math.cos(visual.heading) * visual.speed,
      vy: Math.sin(visual.heading) * visual.speed,
      squash: 0,
      squashAngle: 0,
    };
    keepParticleOutsideRect(particle, safeRect, 16);
    containParticle(particle, bounds);
    particle.squash = 0;
    particles.push(particle);
  }
  return particles;
}

export function containParticle(particle: BubbleParticle, bounds: BubbleBounds) {
  const minimumX = particle.radius + bounds.padding;
  const maximumX = Math.max(minimumX, bounds.width - particle.radius - bounds.padding);
  const minimumY = particle.radius + bounds.padding;
  const maximumY = Math.max(minimumY, bounds.height - particle.radius - bounds.padding);

  if (particle.x < minimumX || particle.x > maximumX) {
    particle.x = clamp(particle.x, minimumX, maximumX);
    particle.vx = particle.x === minimumX ? Math.abs(particle.vx) : -Math.abs(particle.vx);
  }
  if (particle.y < minimumY || particle.y > maximumY) {
    particle.y = clamp(particle.y, minimumY, maximumY);
    particle.vy = particle.y === minimumY ? Math.abs(particle.vy) : -Math.abs(particle.vy);
  }
}

export function keepParticleOutsideRect(particle: BubbleParticle, rect: BubbleRect, gap = 14) {
  const expanded = {
    left: rect.left - particle.radius - gap,
    right: rect.right + particle.radius + gap,
    top: rect.top - particle.radius - gap,
    bottom: rect.bottom + particle.radius + gap,
  };
  if (particle.x <= expanded.left || particle.x >= expanded.right || particle.y <= expanded.top || particle.y >= expanded.bottom) return false;

  const exits = [
    { distance: particle.x - expanded.left, axis: "x", value: expanded.left, direction: -1 },
    { distance: expanded.right - particle.x, axis: "x", value: expanded.right, direction: 1 },
    { distance: particle.y - expanded.top, axis: "y", value: expanded.top, direction: -1 },
    { distance: expanded.bottom - particle.y, axis: "y", value: expanded.bottom, direction: 1 },
  ].sort((first, second) => first.distance - second.distance);
  const exit = exits[0];
  if (exit.axis === "x") {
    particle.x = exit.value;
    particle.vx = Math.abs(particle.vx) * exit.direction;
  } else {
    particle.y = exit.value;
    particle.vy = Math.abs(particle.vy) * exit.direction;
  }
  particle.squash = Math.max(particle.squash, 0.035);
  particle.squashAngle = exit.axis === "x" ? 0 : Math.PI / 2;
  return true;
}

export function resolveParticleCollision(first: BubbleParticle, second: BubbleParticle, gap = 4) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const minimumDistance = first.radius + second.radius + gap;
  const measuredDistance = Math.hypot(dx, dy);
  if (measuredDistance >= minimumDistance) return false;

  const distance = measuredDistance || 0.0001;
  const normalX = measuredDistance ? dx / distance : 1;
  const normalY = measuredDistance ? dy / distance : 0;
  const overlap = minimumDistance - distance;
  const totalMass = first.mass + second.mass;
  first.x -= normalX * overlap * (second.mass / totalMass);
  first.y -= normalY * overlap * (second.mass / totalMass);
  second.x += normalX * overlap * (first.mass / totalMass);
  second.y += normalY * overlap * (first.mass / totalMass);

  const relativeVelocity = (second.vx - first.vx) * normalX + (second.vy - first.vy) * normalY;
  if (relativeVelocity < 0) {
    const restitution = 0.82;
    const impulse = (-(1 + restitution) * relativeVelocity) / (1 / first.mass + 1 / second.mass);
    first.vx -= (impulse / first.mass) * normalX;
    first.vy -= (impulse / first.mass) * normalY;
    second.vx += (impulse / second.mass) * normalX;
    second.vy += (impulse / second.mass) * normalY;
  }

  const squash = clamp(0.035 + overlap / minimumDistance / 2, 0.035, 0.075);
  first.squash = Math.max(first.squash, squash);
  second.squash = Math.max(second.squash, squash);
  first.squashAngle = Math.atan2(normalY, normalX);
  second.squashAngle = first.squashAngle;
  return true;
}

export function advanceParticles(
  particles: BubbleParticle[],
  elapsedSeconds: number,
  bounds: BubbleBounds,
  safeRect: BubbleRect,
) {
  const elapsed = Math.min(elapsedSeconds, 0.05);
  for (const particle of particles) {
    particle.wanderPhase += particle.wanderRate * elapsed;
    particle.vx += Math.cos(particle.wanderPhase) * 0.75 * elapsed;
    particle.vy += Math.sin(particle.wanderPhase * 0.83) * 0.75 * elapsed;
    const speed = Math.hypot(particle.vx, particle.vy);
    const limitedSpeed = clamp(speed, particle.speed * 0.72, particle.speed * 1.35);
    if (speed > 0) {
      particle.vx = (particle.vx / speed) * limitedSpeed;
      particle.vy = (particle.vy / speed) * limitedSpeed;
    }
    particle.x += particle.vx * elapsed;
    particle.y += particle.vy * elapsed;
    particle.squash *= Math.exp(-8 * elapsed);
    containParticle(particle, bounds);
    keepParticleOutsideRect(particle, safeRect);
  }

  for (let firstIndex = 0; firstIndex < particles.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < particles.length; secondIndex += 1) {
      resolveParticleCollision(particles[firstIndex], particles[secondIndex]);
    }
  }
}
