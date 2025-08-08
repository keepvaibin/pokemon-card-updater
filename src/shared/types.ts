export interface Attack {
  name: string;
  cost?: string[];
  convertedEnergyCost: number;
  damage?: string;
  text?: string;
}

export interface Ability {
  name: string;
  text: string;
  type: string;
}

export interface Weakness {
  type: string;
  value: string;
}

export interface Resistance {
  type: string;
  value: string;
}