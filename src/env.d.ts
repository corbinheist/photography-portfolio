declare namespace App {
  interface Locals {
    /** Set by the story route so the MDX story components can resolve image ids. */
    story?: {
      slug: string;
      photos: import('./scripts/utils/story-manifest').StoryManifest;
    };
  }
}
