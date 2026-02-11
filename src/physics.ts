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
export const calculateShot = (aimPosition: Vector): { path: Point[], score: number } => {
  const path: Point[] = [];
  
  // In the new mechanic, aimPosition is where the reticle was when fired.
  // We assume the Target Center is at (0,0) in this "aim space" relative to the target.
  // Or, the frontend sends the offset from the target center.
  // Let's assume aimPosition IS the offset from the bullseye.
  
  const distance = Math.sqrt(aimPosition.x * aimPosition.x + aimPosition.y * aimPosition.y);
  
  // Score calculation: Closer to 0 is better.
  // Max radius for score? 
  // Bullseye < 10 -> 10 pts
  // Inner ring < 30 -> 8 pts
  // Middle ring < 50 -> 5 pts
  // Outer ring < 80 -> 2 pts
  // Miss > 80 -> 0 pts
  
  let score = 0;
  if (distance < 10) score = 10;
  else if (distance < 30) score = 8;
  else if (distance < 50) score = 5;
  else if (distance < 80) score = 2;
  
  // Generate a simple visual "impact" path (just one point for now, or a line zipping in)
  // For visual flair, we can generate a path that starts from "screen" and goes to "target".
  // But for now, just returning the hit point is enough for the frontend to draw the arrow stuck there.
  path.push({ x: aimPosition.x, y: aimPosition.y });

  return { path, score };
};
