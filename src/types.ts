export interface Player {
  id: string;        // socket.id (ephemeral)
  userId: string;    // persistent user ID
  name?: string;
  score: number;
}

export interface Room {
  id: string;
  mode: 'solo' | 'multiplayer';
  players: Player[];
  currentTurn: string; // userId of current player
  round: number;
  maxRounds: number;
  wind: { x: number; y: number };
  // Timed solo fields
  timeLimit: number;
  timeRemaining: number;
  startedAt: number;
}