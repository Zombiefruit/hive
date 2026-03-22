import type { DeckAPI } from "../preload/index";

declare global {
  interface Window {
    deck: DeckAPI;
  }
}
