// 20 starter questions: 7 easy (10 pts), 7 medium (20 pts), 6 hard (30 pts) - these are just
// starting values, edit any of them in the admin Questions tab once loaded.
const q = (difficulty, points, emoji, clue, options, answer) => ({ difficulty, points, emoji, clue, options, answer });

module.exports = [
  q('easy', 10, '🐍', 'This snake-named language is famous for its simple syntax and heavy use in data science.', ['Python', 'Java', 'C++', 'Ruby'], 'Python'),
  q('easy', 10, '🌐📄', 'The markup language that gives every web page its structure.', ['HTML', 'CSS', 'SQL', 'JSON'], 'HTML'),
  q('easy', 10, '🎨👗', 'The language that styles web pages: colours, fonts and layout.', ['CSS', 'XML', 'PHP', 'HTTP'], 'CSS'),
  q('easy', 10, '☕', 'A language named after a hot drink; "write once, run anywhere".', ['Java', 'Kotlin', 'Swift', 'Go'], 'Java'),
  q('easy', 10, '🌿🔀', 'The version-control system created by Linus Torvalds.', ['Git', 'Docker', 'Maven', 'Bash'], 'Git'),
  q('easy', 10, '🗄️🔎', 'The standard language for querying relational databases.', ['SQL', 'HTML', 'YAML', 'CSS'], 'SQL'),
  q('easy', 10, '🐧', 'Open-source operating system kernel whose mascot is Tux.', ['Linux', 'Windows', 'macOS', 'DOS'], 'Linux'),

  q('medium', 20, '🐳📦', 'Platform whose logo is a whale carrying shipping containers.', ['Docker', 'Kubernetes', 'Vagrant', 'Ansible'], 'Docker'),
  q('medium', 20, '🍃🗃️', 'NoSQL document database with a green leaf logo.', ['MongoDB', 'Redis', 'MySQL', 'Cassandra'], 'MongoDB'),
  q('medium', 20, '🔥☁️', "Google's backend-as-a-service platform (auth, realtime database, hosting).", ['Firebase', 'Supabase', 'Heroku', 'Netlify'], 'Firebase'),
  q('medium', 20, '😴🔌', 'An API style built on HTTP verbs like GET, POST, PUT and DELETE.', ['REST', 'SOAP', 'FTP', 'SMTP'], 'REST'),
  q('medium', 20, '🐙🐱', 'Code-hosting platform whose mascot is half octopus, half cat.', ['GitHub', 'GitLab', 'Bitbucket', 'SourceForge'], 'GitHub'),
  q('medium', 20, '⚛️', 'JavaScript library by Meta for building UIs out of components.', ['React', 'Angular', 'Vue', 'Svelte'], 'React'),
  q('medium', 20, '🐘🗄️', 'Advanced open-source relational database with an elephant logo.', ['PostgreSQL', 'MySQL', 'SQLite', 'MariaDB'], 'PostgreSQL'),

  q('hard', 30, '☸️', 'Greek for "helmsman"; orchestrates containers at scale (nickname: K8s).', ['Kubernetes', 'Docker Swarm', 'Terraform', 'Jenkins'], 'Kubernetes'),
  q('hard', 30, '🔓🪪', 'Authorization framework that lets an app access your data without seeing your password.', ['OAuth', 'SAML', 'LDAP', 'Kerberos'], 'OAuth'),
  q('hard', 30, '♾️🚀', 'Automated build, test and deploy pipeline practice.', ['CI/CD', 'TDD', 'MVC', 'CRUD'], 'CI/CD'),
  q('hard', 30, '🔒🔒⏳', 'Two processes each wait forever for a resource the other one holds.', ['Deadlock', 'Livelock', 'Starvation', 'Race condition'], 'Deadlock'),
  q('hard', 30, '🌳⚖️', 'Self-balancing binary search tree; balance factor is always -1, 0 or 1.', ['AVL tree', 'Trie', 'Heap', 'B-tree'], 'AVL tree'),
  q('hard', 30, '🕸️❓', 'Query language for APIs where the client asks for exactly the fields it needs.', ['GraphQL', 'gRPC', 'SOAP', 'WebSocket'], 'GraphQL'),
];
