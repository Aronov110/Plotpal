/**
 * The story every demo account starts with. It is short on purpose, and it has two plot holes put in
 * on purpose, so that a visitor who runs the plot-hole finder gets something real to look at:
 *
 * 1. The causeway is under water from five o'clock, yet Tom says he walked across it dry.
 * 2. The lamp is lit at dusk in one scene, and "at midnight" according to the logbook in another.
 *
 * If you change the text, keep both, and keep the checks in `routes/__tests__/auth-demo.integration.test.ts`.
 */
export interface SampleScene {
  readonly title: string;
  readonly text: string;
}

export interface SampleAct {
  readonly title: string;
  readonly scenes: readonly SampleScene[];
}

export interface SampleStory {
  readonly project: { readonly title: string; readonly logline: string };
  readonly acts: readonly SampleAct[];
}

export const SAMPLE_STORY: SampleStory = {
  project: {
    title: "The Last Light",
    logline:
      "A lighthouse keeper, alone in a storm, finds out who has been using her lamp. " +
      "This is a demo story. It is deleted automatically after 24 hours.",
  },
  acts: [
    {
      title: "Act 1: The Storm",
      scenes: [
        {
          title: "The last boat",
          text:
            "The last boat left the island at four, and Mara watched it shrink against a sky the " +
            "colour of old iron. By five the sea had taken the causeway. She had seen it do that " +
            "only twice before: the road simply gone under grey water, nothing left but the tops " +
            "of the marker posts. Nobody could reach the lighthouse now, and nobody could leave " +
            "it. Her brother Tom had waved from the stern and promised to be back when the " +
            "weather turned. She climbed the hundred and twelve steps to the lamp room with the " +
            "wind pulling at her coat.",
        },
        {
          title: "The lamp",
          text:
            "At dusk Mara lit the lamp, as her father had taught her: the wick first, then the " +
            "shutter, then the long slow turn of the lens until the beam swept out across the " +
            "water. It was the only light for twenty miles. She checked the oil and found enough " +
            "for three nights. She sat with the logbook on her knee and wrote the date and the " +
            "wind, and for a moment the storm felt almost friendly.",
        },
      ],
    },
    {
      title: "Act 2: The Visitor",
      scenes: [
        {
          title: "A knock at midnight",
          text:
            "The knock came at midnight, three slow raps on the tower door. Mara took the lantern " +
            "down and found Tom on the step, grinning and out of breath. 'I came over the " +
            "causeway,' he said. 'Dry all the way.' She did not ask how, because he was already " +
            "past her and climbing, talking about the boat, the weather and the supper he had " +
            "missed.",
        },
        {
          title: "The logbook",
          text:
            "Mara sat up with the logbook after Tom had gone to bed. Her entry for the evening " +
            "said she had lit the lamp at midnight, just as the knock came. She read it twice, " +
            "certain that was not right, then closed the book. Somewhere below, someone was " +
            "whistling her father's tune, a tune Tom had never learned.",
        },
      ],
    },
  ],
};
