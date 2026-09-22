const { Schema, model } = require('mongoose');

const answeredSchema = new Schema(
  {
    question: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    points: Number, // what the clue was worth
    earned: Number, // what the participant got
    status: { type: String, enum: ['correct', 'wrong', 'timeout', 'penalty'], required: true },
    chosen: { type: String, default: null },
    timeMs: Number,
    at: Date,
  },
  { _id: false }
);

const currentSchema = new Schema(
  { question: Schema.Types.ObjectId, startedAt: Date, endsAt: Date },
  { _id: false }
);

const participantSchema = new Schema(
  {
    // identity, imported from the Google Form responses — never entered by hand
    name: { type: String, required: true, trim: true },
    year: { type: String, enum: ['1st', '2nd'], required: true },
    dept: { type: String, default: '', trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    regNo: { type: String, default: '', trim: true },
    slot: { type: String, default: '', trim: true },

    // access
    active: { type: Boolean, default: true },
    sessionToken: { type: String, default: null }, // set on first login; a second device cannot reuse the same email
    boundAt: Date,
    accessLog: [{ at: Date, ip: String, ua: String, result: String, _id: false }],

    // game state
    seed: Number,
    grid: [{ question: Schema.Types.ObjectId, tier: String, points: Number, _id: false }], // this participant's randomized order
    current: { type: currentSchema, default: null },
    answered: [answeredSchema],
    score: { type: Number, default: 0 },
    totalTimeMs: { type: Number, default: 0 }, // time spent on correct answers (tie-breaker)
    finishedAt: { type: Date, default: null }, // set when the participant submits, once every clue is attempted

    // violations: tracked per participant, only ever shown to admin, never on the participant's own screen
    violations: [{ kind: String, at: Date, question: Schema.Types.ObjectId, penalized: Boolean, _id: false }],
  },
  { timestamps: true }
);

module.exports = model('Participant', participantSchema);
