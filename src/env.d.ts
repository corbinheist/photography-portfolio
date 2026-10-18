declare namespace App {
  interface Locals {
    /** Set by the story route so the MDX story components can resolve image ids. */
    story?: {
      slug: string;
      photos: import('./scripts/utils/story-manifest').StoryManifest;
      /** Reading-order number of each photograph, from 1. */
      numbers: Map<string, number>;
      /** Photographs that already have a frame anchor; a repeat gets none. */
      anchored: Set<string>;
    };
  }
}
