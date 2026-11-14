// A short buzz when this device's player is knocked out. Only phones that
// support vibration do anything (Android; iPhones ignore it). Follows the same
// setting as the screen shake.

export class Haptics {
  constructor() {
    this.enabled = true;
  }

  knockout() {
    if (!this.enabled) return;
    try {
      navigator.vibrate?.(120);
    } catch {
      // Not allowed here (for example inside an embedded page): the game goes on.
    }
  }
}
