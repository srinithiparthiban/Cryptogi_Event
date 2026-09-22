const { Schema, model } = require('mongoose');

const eventSchema = new Schema(
  {
    key: { type: String, default: 'main', unique: true },
    status: { type: String, enum: ['setup', 'live', 'ended'], default: 'setup' },
    timerSeconds: { type: Number, default: 20, min: 10, max: 60 },
    penalty: { type: String, enum: ['log', 'lock'], default: 'lock' }, // what a focus/fullscreen violation does
    violationLimit: { type: Number, default: 5, min: 0 }, // more than this many violations = not eligible to win

    // Optional schedule. When set, the server flips status on its own — no admin click needed,
    // and it survives a restart because it is recomputed from these stored times, not from memory.
    scheduledStart: Date,
    scheduledEnd: Date,

    startedAt: Date, // when the event actually went live (manual click or schedule)
    endedAt: Date, // when it actually ended

    winners: { type: [Schema.Types.Mixed], default: [] }, // top ranks among eligible participants, written once when the event ends
    standings: { type: [Schema.Types.Mixed], default: [] }, // full final table, everyone
  },
  { timestamps: true }
);

module.exports = model('Event', eventSchema);
