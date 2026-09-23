// CRYPTOGY - Emoji Decode Challenge question bank, loaded directly from the organizer's question
// document (Cryptogy_30_Emoji_MCQs.docx): 30 questions split 10/10/10 across the three tiers -
// Q1-10 easy (10 pts), Q11-20 medium (20 pts), Q21-30 hard (30 pts). Edit any of them in the
// admin Questions tab once loaded; this file is only the starting seed.
const q = (difficulty, points, emoji, clue, options, answer) => ({ difficulty, points, emoji, clue, options, answer });

module.exports = [
  // ---- Easy (10 pts) - Q1 to Q10 ----
  q('easy', 10, '🕷️ 🌐', 'Think of software that explores linked pages across the web.', ['Web crawler', 'Web browser', 'Search engine', 'Web server'], 'Web crawler'),
  q('easy', 10, '🔥 🧱', 'This security barrier controls traffic entering or leaving a network.', ['Antivirus', 'Firewall', 'Encryption', 'Proxy'], 'Firewall'),
  q('easy', 10, '🐛 🔍', 'Programmers do this when tracking down mistakes in code.', ['Compiling', 'Debugging', 'Deploying', 'Formatting'], 'Debugging'),
  q('easy', 10, '🔑 🔒', 'A secret value can be used to protect information from being read.', ['Compression', 'Encryption', 'Indexing', 'Routing'], 'Encryption'),
  q('easy', 10, '🔓 📜', 'This process turns protected data back into readable information.', ['Decryption', 'Authentication', 'Validation', 'Hashing'], 'Decryption'),
  q('easy', 10, '🧠 📋 ➡️', 'A well-defined sequence of steps used to solve a problem.', ['Algorithm', 'Database', 'Compiler', 'Protocol'], 'Algorithm'),
  q('easy', 10, '🗃️ 🧾', 'Organized information can be stored, searched, and updated here.', ['Database', 'Operating system', 'Browser', 'Firewall'], 'Database'),
  q('easy', 10, '🐍 💻', 'This programming language shares its name with a type of snake.', ['Java', 'Python', 'Ruby', 'Swift'], 'Python'),
  q('easy', 10, '☕ 💻', 'A programming language shares its name with a popular drink.', ['C', 'Java', 'Kotlin', 'Go'], 'Java'),
  q('easy', 10, '🌐 🔗 💻', 'Devices communicate and share resources through this arrangement.', ['Network', 'Spreadsheet', 'Algorithm', 'Variable'], 'Network'),

  // ---- Medium (20 pts) - Q11 to Q20 ----
  q('medium', 20, '🪪 👆 ✅', 'A system checks whether you really are the person you claim to be.', ['Authentication', 'Authorization', 'Encryption', 'Compilation'], 'Authentication'),
  q('medium', 20, '👤 🛂 🚪', 'After identity is confirmed, this determines what you are allowed to access.', ['Authorization', 'Authentication', 'Debugging', 'Backup'], 'Authorization'),
  q('medium', 20, '🦠 💻', 'This unwanted software can damage a device or interfere with its operation.', ['Malware', 'Middleware', 'Firmware', 'Freeware'], 'Malware'),
  q('medium', 20, '📧 🎣', 'A deceptive message tries to trick someone into revealing sensitive details.', ['Phishing', 'Patching', 'Caching', 'Clustering'], 'Phishing'),
  q('medium', 20, '📦 🗜️', 'This reduces the size of files or data for storage or transfer.', ['Compression', 'Encryption', 'Replication', 'Rendering'], 'Compression'),
  q('medium', 20, '☁️ 💾', 'Files are stored on remote systems and accessed over the internet.', ['Cloud storage', 'Local storage', 'Cache memory', 'Virtual memory'], 'Cloud storage'),
  q('medium', 20, '🧱 🔗 🧱', 'A sequence of connected records is a key idea behind this technology.', ['Blockchain', 'Firewall', 'Tree structure', 'Cloud computing'], 'Blockchain'),
  q('medium', 20, '🔢 0️⃣ 1️⃣', 'This number system uses only two possible digits.', ['Binary', 'Decimal', 'Hexadecimal', 'Octal'], 'Binary'),
  q('medium', 20, '🔠 🔢 🧮', 'This base-16 number system uses digits and letters A through F.', ['Binary', 'Decimal', 'Hexadecimal', 'Roman numerals'], 'Hexadecimal'),
  q('medium', 20, '🖥️ ⚙️ 🧑‍💻', 'This core software manages hardware and provides services for applications.', ['Operating system', 'Text editor', 'Web page', 'Compiler'], 'Operating system'),
 /*
  // ---- Hard (30 pts) - Q21 to Q30 ----
  q('hard', 30, '⌨️ 🖱️ 🖥️', 'These are examples of ways a user provides data or commands to a computer.', ['Input devices', 'Output devices', 'Storage devices', 'Network devices'], 'Input devices'),
  q('hard', 30, '🖥️ 🔊 🖨️', 'These components present processed information to a user.', ['Output devices', 'Input devices', 'Processors', 'Routers'], 'Output devices'),
  q('hard', 30, '🧮 ⚡ 🧠', "Often called the computer's brain, it executes instructions.", ['CPU', 'RAM', 'SSD', 'GPU memory'], 'CPU'),
  q('hard', 30, '🧠 ⏳ 🔌', 'This temporary working memory loses its contents when power is turned off.', ['RAM', 'ROM', 'SSD', 'DVD'], 'RAM'),
  q('hard', 30, '💽 📂 🗄️', 'This non-volatile component keeps files even after shutdown.', ['Storage', 'Cache', 'Register', 'ALU'], 'Storage'),
  q('hard', 30, '🔁 ❓ ✅❌', 'A program can use this to choose between alternative paths.', ['Conditional statement', 'Comment', 'Variable declaration', 'Function call'], 'Conditional statement'),
  q('hard', 30, '🔄 🔢 🔚', 'Repeating a block of instructions is a common programming technique.', ['Loop', 'Array', 'Class', 'Exception'], 'Loop'),
  q('hard', 30, '📚 🔢 🧺', 'This structure stores multiple values under one name, often by position.', ['Array', 'Boolean', 'Operator', 'Method'], 'Array'),
  q('hard', 30, '🏗️ 🧩 🧬', 'In object-oriented programming, this defines the blueprint for creating objects.', ['Class', 'Loop', 'Packet', 'Query'], 'Class'),
  q('hard', 30, '🧑‍🏫 🧑‍🎓 🧬', 'In OOP, a new class can derive features from an existing class using this concept.', ['Inheritance', 'Iteration', 'Encryption', 'Normalization'], 'Inheritance'),
  */
];