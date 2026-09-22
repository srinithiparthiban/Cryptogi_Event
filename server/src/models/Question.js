const { Schema, model } = require('mongoose');

const DIFFICULTIES = ['easy', 'medium', 'hard'];

const questionSchema = new Schema(
  {
    emoji: { type: String, required: true, trim: true },
    clue: { type: String, default: '', trim: true }, // text hint shown under the emoji
    options: { type: [String], default: [] },
    answer: { type: String, required: true, trim: true },
    difficulty: { type: String, enum: DIFFICULTIES, required: true }, // which board column this sits in
    points: { type: Number, required: true, min: 1, max: 1000 }, // set per question by the admin, not derived from difficulty
  },
  { timestamps: true }
);

questionSchema.pre('validate', function (next) {
  const o = this.options || [];
  if (o.length < 2 || o.length > 6) return next(new Error('Provide 2 to 6 options.'));
  if (new Set(o).size !== o.length) return next(new Error('Options must be different from each other.'));
  if (!o.includes(this.answer)) return next(new Error('The correct answer must be one of the options.'));
  next();
});

const Question = model('Question', questionSchema);
Question.DIFFICULTIES = DIFFICULTIES;
module.exports = Question;
