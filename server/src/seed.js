// npm run seed  -> loads the 20 sample questions (only if the questions collection is empty)
const config = require('./config');
const mongoose = require('mongoose');
const Question = require('./models/Question');
const sample = require('./sampleQuestions');

(async () => {
  await mongoose.connect(config.MONGO_URI);
  if (await Question.countDocuments()) {
    console.log('Questions already exist - nothing seeded.');
  } else {
    await Question.insertMany(sample);
    console.log(`Seeded ${sample.length} questions.`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
