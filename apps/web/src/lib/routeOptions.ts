/** Le esclusioni di percorso di una ricerca (Directions `exclude`): autostrada, pedaggi, traghetti. */
export interface RouteExclusions {
  avoidMotorway: boolean;
  avoidTolls: boolean;
  avoidFerries: boolean;
}

export const NO_EXCLUSIONS: RouteExclusions = { avoidMotorway: false, avoidTolls: false, avoidFerries: false };

export const sameExclusions = (a: RouteExclusions, b: RouteExclusions): boolean =>
  a.avoidMotorway === b.avoidMotorway && a.avoidTolls === b.avoidTolls && a.avoidFerries === b.avoidFerries;

/** Le esclusioni attive in parole, es. "senza autostrada", "senza autostrada e pedaggi"; null se non ce n'è nessuna. */
export function describeExclusions(exclusions: RouteExclusions): string | null {
  const parts = [exclusions.avoidMotorway && "autostrada", exclusions.avoidTolls && "pedaggi", exclusions.avoidFerries && "traghetti"].filter(
    (part): part is string => typeof part === "string",
  );
  if (parts.length === 0) return null;
  const list = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
  return `senza ${list}`;
}
