export interface ShotParams {
  angle: number; // in degrees? Actually vector x/y from drag
  power: number; // 0-100?
  wind: number;
}

export interface Vector {
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export const GRAVITY = 0.5; // Adjusted for game feel

// Function to calculate trajectory points
// Function to calculate shot result based on reticle position
export const calculateShot = (aimPosition: Vector, wind: Vector): { path: Point[], score: number } => {
  const path: Point[] = [];
  
  // Apply wind to the shot
  // Wind pushes the arrow during flight.
  // The aim position is where you aimed, but the arrow drifts.
  // Let's say wind is a force vector.
  const windDriftFactor = 8.0; // Significant drift
  const finalX = aimPosition.x + wind.x * windDriftFactor;
  const finalY = aimPosition.y + wind.y * windDriftFactor;

  const finalPos = { x: finalX, y: finalY };
  
  const distance = Math.sqrt(finalPos.x * finalPos.x + finalPos.y * finalPos.y);
  
  let score = 0;
  if (distance < 10) score = 10;
  else if (distance < 30) score = 8;
  else if (distance < 50) score = 5;
  else if (distance < 80) score = 2;
  
  path.push(finalPos);

  return { path, score };
};
