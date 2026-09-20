import type { Behavior } from '../simulation/types';

export const RESPONSES: Record<Behavior, string[]> = {
  IDLE: ['existing. buzzing. contributing nothing to GDP.', 'no thoughts, just a very specific wiring diagram.'],
  MOVE_LEFT: ['aight damn', 'bro thinks he’s my GPS 💀', 'recalculating. against my will.'],
  MOVE_RIGHT: ['bro thinks he’s my GPS 💀', 'your navigation privileges are under review.', 'fine. taking the scenic route.'],
  APPROACH: ['why are you summoning me 😭', 'rare human W', 'acceptable mammal behavior.', 'finally, enrichment.'],
  STOP: ['bro said ✋ like he’s traffic police', 'buffering, biologically.', 'standing still is my contribution.'],
  RETREAT: ['gladly 💀', 'respectfully, absolutely not.', 'this meeting could have been a pheromone.', 'your vibes have a measurable exit velocity.'],
  ESCAPE: ['crazy coming from a species with student loans', 'bro evolved opposable thumbs just to do that 💀', 'you have a prefrontal cortex. act like it.', 'nah your vibes are biologically unacceptable 💀', 'one more gesture and I’m calling evolution.'],
  CONFUSED: ['your signal has been forwarded to absolutely nobody', 'the neurons have entered a group discussion.', 'instructions unclear. still a fly.', 'that did not pass the vibe-to-synapse check.'],
};

export class Dialogue {
  private positions = new Map<Behavior, number>();
  next(state: Behavior) {
    const position = this.positions.get(state) ?? 0;
    this.positions.set(state, position + 1);
    return RESPONSES[state][position % RESPONSES[state].length];
  }
}
