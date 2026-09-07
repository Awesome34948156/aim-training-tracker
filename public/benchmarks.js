// Kovaak's S5 benchmark structure (Voltaic App, app.voltaic.gg).
// Maps scenario names to aim category + subcategory for filtering and chart
// grouping. Intermediate tier comes from the benchmark page; the Novice tier
// follows the same 3x3 structure as it appears in local stats. "VT FlyTS
// Intermediate S5" is not on the current benchmark page but exists in local
// stats - kept under Switching > Evasive.
const S5_BENCHMARK = {
  Intermediate: {
    Clicking: {
      Dynamic: ["VT Pasu Intermediate S5", "VT Popcorn Intermediate S5"],
      Static: ["VT 1w3ts Intermediate S5", "VT ww5t Intermediate S5"],
      Linear: ["VT Frogtagon Intermediate S5", "VT Floating Heads Intermediate S5"],
    },
    Tracking: {
      Precise: ["VT PGT Intermediate S5", "VT Snake Track Intermediate S5"],
      Reactive: ["VT Aether Intermediate S5", "VT Ground Intermediate S5"],
      Control: ["VT Raw Control Intermediate S5", "VT Controlsphere Intermediate S5"],
    },
    Switching: {
      Speed: ["VT DotTS Intermediate S5", "VT EddieTS Intermediate S5"],
      Evasive: ["VT DriftTS Intermediate S5", "VT FluTS Intermediate S5", "VT FlyTS Intermediate S5"],
      Stability: ["VT ControlTS Intermediate S5", "VT Penta Bounce Intermediate S5"],
    },
  },
  Novice: {
    Clicking: {
      Dynamic: ["VT Pasu Novice S5", "VT Popcorn Novice S5"],
      Static: ["VT 1w4ts Novice S5", "VT ww5t Novice S5"],
      Linear: ["VT Frogtagon Novice S5", "VT Floating Heads Novice S5"],
    },
    Tracking: {
      Precise: ["VT PGT Novice S5", "VT Snake Track Novice S5"],
      Reactive: ["VT Aether Novice S5", "VT Ground Novice S5"],
      Control: ["VT Raw Control Novice S5", "VT Controlsphere Novice S5"],
    },
    Switching: {
      Speed: ["VT DotTS Novice S5", "VT EddieTS Novice S5"],
      Evasive: ["VT FlyTS Novice S5", "VT DriftTS Novice S5"],
      Stability: ["VT ControlTS Novice S5", "VT Penta Bounce Novice S5"],
    },
  },
};

// Flat scenario name -> { category, subcategory } lookup across all tiers.
const SCENARIO_CATEGORIES = {};
for (const tiers of Object.values(S5_BENCHMARK)) {
  for (const [category, subs] of Object.entries(tiers)) {
    for (const [subcategory, scenarios] of Object.entries(subs)) {
      for (const scenario of scenarios) SCENARIO_CATEGORIES[scenario] = { category, subcategory };
    }
  }
}

const CATEGORIES = ["Clicking", "Tracking", "Switching"];

function categoryOf(scenario) {
  return SCENARIO_CATEGORIES[scenario] || { category: "Other", subcategory: null };
}

function subcategoriesOf(category) {
  return [...new Set(Object.values(SCENARIO_CATEGORIES).filter((item) => item.category === category).map((item) => item.subcategory))];
}
