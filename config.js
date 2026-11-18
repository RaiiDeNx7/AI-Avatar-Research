// Edit this file when the videos, avatar names, survey, and log are ready.
var R2_VIDEO = "https://pub-f07d4f97963346d2b326a1c56c0d58f8.r2.dev/";
function r2(name) {
  return R2_VIDEO + encodeURIComponent(name);
}

window.STUDY_CONFIG = {
  title: "AI Avatar Study",
  overviewTitle: "About this study",
  paragraphs: [
    "This study looks at how people respond to short videos of AI avatars.",
    "You will watch three videos. On the Fixed Study path, every video shows the same avatar. On the Variety Study path, you choose one of six avatars before each video.",
    "Your participant ID appears in the top right after you start. The survey uses that ID to connect your answers to the videos you watched.",
  ],
  steps: [
    "Press Start new participant. Your PID appears in the top right.",
    "Open Participation and choose Fixed Study or Variety Study.",
    "Watch three videos all the way through. The next step stays locked until the current video ends.",
    "Open the survey and submit it. Then return home and start a new participant before the next person begins.",
  ],
  fixed: {
    buttonTitle: "Fixed Study",
    buttonText: "Watch three videos of one avatar, one at a time.",
    avatarId: "black-female",
    avatarLabel: "Black Female",
    videos: [
      { src: r2("Python Conditionals Black Female.mp4") },
      { src: r2("Python For Loops Black Female.mp4") },
      { src: r2("Time Complexity Black Female.mp4") },
    ],
  },
  variety: {
    buttonTitle: "Variety Study",
    buttonText: "Choose one of six avatars before each of the three videos.",
    intro: "Choose one avatar for this video. You will choose again before the next video.",
    avatars: [
      { id: "white-male", label: "White Male", portrait: "" },
      { id: "white-female", label: "White Female", portrait: "" },
      { id: "black-male", label: "Black Male", portrait: "" },
      { id: "black-female", label: "Black Female", portrait: "" },
      { id: "asian-male", label: "Asian Male", portrait: "" },
      { id: "asian-female", label: "Asian Female", portrait: "" },
    ],
    rounds: [
      {
        id: "round-1",
        clips: {
          "white-male": r2("Python Conditionals White Male.mp4"),
          "white-female": r2("Python Conditionals White Female.mp4"),
          "black-male": r2("Python Conditionals Black Male.mp4"),
          "black-female": r2("Python Conditionals Black Female.mp4"),
          "asian-male": r2("Python Conditionals Asian Male.mp4"),
          "asian-female": r2("Python Conditionals Asian Female.mp4"),
        },
      },
      {
        id: "round-2",
        clips: {
          "white-male": r2("Python For Loops White Male.mp4"),
          "white-female": r2("Python For Loops White Female.mp4"),
          "black-male": r2("Python For Loops Black Male.mp4"),
          "black-female": r2("Python For Loops Black Female.mp4"),
          "asian-male": r2("Python For Loops Asian Male.mp4"),
          "asian-female": r2("Python For Loops Asian Female.mp4"),
        },
      },
      {
        id: "round-3",
        clips: {
          "white-male": r2("Time Complexity White Male.mp4"),
          "white-female": r2("Time Complexity White Female.mp4"),
          "black-male": r2("Time Complexity Black Male.mp4"),
          "black-female": r2("Time Complexity Black Female.mp4"),
          "asian-male": r2("Time Complexity Asian Male.mp4"),
          "asian-female": r2("Time Complexity Asian Female.mp4"),
        },
      },
    ],
  },
  survey: {
    // Normal form link, ending in /viewform.
    formUrl: "https://docs.google.com/forms/d/e/1FAIpQLScyhegLmzxd_1Sw863N1SuAwtY97b6bt8Dc7nKCwXHpVBPmvA/viewform",
    // Leave blank. The participant copies the PID and types it into the form.
    pidEntryId: "",
  },
  log: {
    // Apps Script web app URL, ending in /exec. This issues each PID once and receives the watch log.
    scriptUrl: "",
  },
};
