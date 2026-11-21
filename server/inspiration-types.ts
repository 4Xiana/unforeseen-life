/** Shared data shape, deliberately independent of server runtime imports. */
export interface InspirationTask {
  title: string;
  description: string;
  hook: string;
  tags: string[];
  category: 'explore' | 'organize' | 'create' | 'connect' | 'sense';
  minutes: number;
  scene: 'any' | 'home' | 'work' | 'outdoors';
  people: number;
  cost: number;
  energy: 'low' | 'medium' | 'high';
  materials: string;
}
