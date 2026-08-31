export default {
  "web/**/*.{js,jsx,ts,tsx}": (files) => [
    `npm --prefix web run lint -- ${files.join(" ")}`,
    // tsc checks the whole project graph, not individual files, so this
    // runs once regardless of how many files matched above.
    "npm --prefix web run typecheck",
  ],
};
