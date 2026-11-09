// Security Lab lesson content.
// Rules for writing here (they keep the app easy for beginners on a phone):
//   - One idea per step. "text" is at most two short sentences.
//   - Every technical word gets a plain definition in "words".
//   - Prefer a picture ("flow", "compare", "code", "message") over more text.
//   - In code and messages, wrap the part to look at in [[double brackets]] to highlight it.
//   - Each quiz has 3 questions. Each question has one right answer and a one-sentence "why".
"use strict";

window.LAB_LESSONS = [
  {
    id: "passwords",
    title: "Strong passwords",
    goal: "Make passwords that are hard to guess.",
    minutes: 3,
    steps: [
      {
        title: "Attackers guess passwords",
        text: "Programs can try billions of guesses very fast. Short passwords fall first.",
        words: [["Brute-force attack", "Trying every possible password until one works."]],
        visual: { type: "flow", nodes: [
          { icon: "🤖", text: "Guessing program", tone: "bad" },
          { arrow: "tries 123456, password, qwerty…" },
          { icon: "🔐", text: "Your account" }
        ] }
      },
      {
        title: "Long beats tricky",
        text: "Each extra character makes guessing much slower. Four random words beat one short tricky word.",
        visual: { type: "compare",
          bad: { label: "Weak", value: "P@ssw0rd", note: "Short. Guessed in seconds." },
          good: { label: "Strong", value: "lamp-cactus-ocean-violin", note: "Long. Very slow to guess." } }
      },
      {
        title: "Never reuse a password",
        text: "When one site leaks passwords, attackers try them on other sites.",
        words: [["Data breach", "When a company's private data gets stolen."]],
        visual: { type: "flow", nodes: [
          { icon: "💥", text: "Shop website gets hacked", tone: "bad" },
          { arrow: "your password leaks" },
          { icon: "🤖", text: "Attacker tries it everywhere", tone: "bad" },
          { arrow: "same password works" },
          { icon: "📧", text: "Your email and bank" }
        ] }
      },
      {
        title: "Add a second lock",
        text: "Turn on two-factor login. A stolen password alone is then not enough.",
        words: [["Two-factor authentication (2FA)", "Logging in with your password plus a second proof, like a code on your phone."]],
        visual: { type: "flow", nodes: [
          { icon: "🔑", text: "1. Type your password" },
          { arrow: "then" },
          { icon: "📱", text: "2. Enter the code from your phone" },
          { arrow: "both correct" },
          { icon: "✅", text: "You're in", tone: "good" }
        ] }
      },
      {
        title: "How good sites store passwords",
        text: "Good sites never save your real password. They save a scrambled version instead.",
        words: [["Hash", "A one-way scramble. Easy to make, nearly impossible to undo."]],
        visual: { type: "code", caption: "What the website saves", lines: [
          "password = \"sunflower\"",
          "saved    = [[hash(password)]]",
          "",
          "// saved is now \"5e8f1a9c…\"",
          "// the real password is never stored"
        ] }
      }
    ],
    quiz: [
      { q: "Which password is hardest to guess?",
        options: ["Tr0ub!e", "summer2024", "lamp-cactus-ocean-violin", "qwerty123"],
        answer: 2,
        why: "It is the longest. Length matters more than symbols." },
      { q: "A website you use was hacked. What should you do first?",
        options: ["Nothing, it was their fault", "Change that password everywhere you used it", "Delete your email account"],
        answer: 1,
        why: "Attackers will try the leaked password on your other accounts." },
      { q: "What does two-factor authentication add?",
        options: ["A longer password", "A second proof, like a code on your phone", "A faster login"],
        answer: 1,
        why: "Even with your password, an attacker still needs your phone." }
    ]
  },

  {
    id: "phishing",
    title: "Spot phishing",
    goal: "Recognize fake messages before you click.",
    minutes: 3,
    steps: [
      {
        title: "What is phishing?",
        text: "A fake message that tries to trick you. It usually wants your password or money.",
        words: [["Phishing", "A fake email or text pretending to be a company you trust."]],
        visual: { type: "flow", nodes: [
          { icon: "✉️", text: "Fake email arrives", tone: "bad" },
          { arrow: "you tap the link" },
          { icon: "🌐", text: "Fake login page", tone: "bad" },
          { arrow: "you type your password" },
          { icon: "🕵️", text: "Attacker gets it", tone: "bad" }
        ] }
      },
      {
        title: "Clue 1: Check the sender",
        text: "Look closely at the address. Here the \"l\" in paypal is really the number 1.",
        visual: { type: "message", lines: [
          "From: support@[[paypa1]]-help.com",
          "Subject: Your account is locked"
        ] }
      },
      {
        title: "Clue 2: Pressure to hurry",
        text: "Scammers rush you so you don't stop to think. Real companies rarely threaten you.",
        visual: { type: "message", lines: [
          "We noticed unusual activity.",
          "[[Act within 1 hour]] or your account",
          "will be [[permanently deleted]]."
        ] }
      },
      {
        title: "Clue 3: Where the link really goes",
        text: "On iPhone, press and hold a link to preview it. Read the end of the site name.",
        words: [["Domain", "A website's name, like apple.com. Its last part shows who owns it."]],
        visual: { type: "compare",
          bad: { label: "The link shows", value: "apple.com/help", note: "Looks fine…", tone: "neutral" },
          good: { label: "It really opens", value: "apple.com.[[login-check.xyz]]", note: "login-check.xyz owns it. Not Apple!", tone: "bad" } }
      },
      {
        title: "What to do instead",
        text: "Don't tap the link. Open the real app or type the website yourself.",
        visual: { type: "flow", nodes: [
          { icon: "🤔", text: "Message looks odd" },
          { arrow: "don't tap the link" },
          { icon: "📲", text: "Open the real app yourself", tone: "good" },
          { arrow: "then" },
          { icon: "🚩", text: "Report or delete the message", tone: "good" }
        ] }
      }
    ],
    quiz: [
      { q: "An email from \"support@amaz0n-help.net\" asks you to log in. What's the clue?",
        options: ["The subject line", "The sender's address is fake", "It was sent at night"],
        answer: 1,
        why: "\"amaz0n\" uses a zero, and amazon doesn't use that domain." },
      { q: "A text says \"Pay now or you'll be arrested today.\" This is a sign of…",
        options: ["Pressure to hurry", "A real warning", "A software update"],
        answer: 0,
        why: "Scammers create panic so you act without thinking." },
      { q: "What's the safest way to check your account after a suspicious email?",
        options: ["Tap the link in the email", "Reply and ask if it's real", "Open the company's app yourself"],
        answer: 2,
        why: "Going there yourself skips any fake link." }
    ]
  },

  {
    id: "https",
    title: "HTTPS and the padlock",
    goal: "Know what the padlock does, and what it doesn't.",
    minutes: 2,
    steps: [
      {
        title: "Your data takes a trip",
        text: "Data passes through many machines on its way. Anyone along the path might read it.",
        visual: { type: "flow", nodes: [
          { icon: "📱", text: "Your phone" },
          { arrow: "travels through" },
          { icon: "📶", text: "Wi-Fi router" },
          { arrow: "then" },
          { icon: "🌍", text: "The internet" },
          { arrow: "finally" },
          { icon: "🏦", text: "The website" }
        ] }
      },
      {
        title: "HTTPS scrambles it",
        text: "With HTTPS, only you and the website can read the data.",
        words: [["Encryption", "Scrambling data so only the right person can unscramble it."],
                ["HTTPS", "The private version of a web address. The \"S\" means secure."]],
        visual: { type: "compare",
          bad: { label: "http:// (anyone can read)", value: "password=sunflower", note: "Readable on the way." },
          good: { label: "https:// (scrambled)", value: "x8$kQ#2v!Lp9…", note: "Unreadable on the way." } }
      },
      {
        title: "The padlock means private, not honest",
        text: "Fake sites can have a padlock too. Always check the site name as well.",
        visual: { type: "compare",
          bad: { label: "Padlock tells you", value: "🔒 Nobody can read this connection", note: "True." , tone: "good" },
          good: { label: "Padlock does NOT tell you", value: "This site is the real company", note: "Check the name yourself.", tone: "bad" } }
      },
      {
        title: "Public Wi-Fi tip",
        text: "On café or airport Wi-Fi, only log in to sites that show https.",
        visual: { type: "flow", nodes: [
          { icon: "☕", text: "Café Wi-Fi" },
          { arrow: "check the address bar" },
          { icon: "🔒", text: "https:// with padlock → OK to log in", tone: "good" }
        ] }
      }
    ],
    quiz: [
      { q: "What does HTTPS protect?",
        options: ["Your data while it travels", "Your phone from viruses", "You from fake websites"],
        answer: 0,
        why: "HTTPS scrambles data on its way between you and the site." },
      { q: "A site has a padlock. Does that prove it's the real bank?",
        options: ["Yes, always", "No, check the site name too"],
        answer: 1,
        why: "Scam sites can get a padlock too." },
      { q: "You're on airport Wi-Fi. When is it OK to log in?",
        options: ["On any site", "Only on sites with https://", "Never on a phone"],
        answer: 1,
        why: "HTTPS keeps others on the same Wi-Fi from reading your data." }
    ]
  },

  {
    id: "sql-injection",
    title: "SQL injection",
    goal: "See how typed text can hijack a website's code.",
    minutes: 4,
    steps: [
      {
        title: "Websites ask databases questions",
        text: "When you log in, the website asks its database a question about you.",
        words: [["Database", "Where a website keeps its information, like a giant spreadsheet."],
                ["SQL", "The language websites use to ask databases questions."]],
        visual: { type: "flow", nodes: [
          { icon: "📝", text: "You type your name" },
          { arrow: "sent to" },
          { icon: "⚙️", text: "Website code builds a question" },
          { arrow: "asks" },
          { icon: "🗄️", text: "Database answers" }
        ] }
      },
      {
        title: "The risky way to build the question",
        text: "Some code glues your typing straight into the question. The highlighted part is what you typed.",
        visual: { type: "code", caption: "Risky code", lines: [
          "query = \"SELECT * FROM users",
          "         WHERE name = '\" + [[name]] + \"'\""
        ] }
      },
      {
        title: "Try it yourself",
        text: "Tap each example. Watch how the question changes.",
        words: [["Injection", "Sneaking your own code into a program through a text box."]],
        visual: { type: "try-sql" }
      },
      {
        title: "The fix: keep data separate",
        text: "The ? is a placeholder. The database treats your typing as plain text, never as code.",
        words: [["Parameterized query", "A question with blanks (?) that are filled in safely."]],
        visual: { type: "code", caption: "Safe code", lines: [
          "query = \"SELECT * FROM users WHERE name = [[?]]\"",
          "db.run(query, [name])"
        ] }
      },
      {
        title: "The big rule",
        text: "Never trust what users type. Always keep it separate from code.",
        visual: { type: "flow", nodes: [
          { icon: "⌨️", text: "User types anything" },
          { arrow: "goes into a ? placeholder" },
          { icon: "🛡️", text: "Treated as plain text", tone: "good" },
          { arrow: "result" },
          { icon: "✅", text: "The question can't be changed", tone: "good" }
        ] }
      }
    ],
    quiz: [
      { q: "What is SQL injection?",
        options: ["A virus on your phone", "Typed text that changes a website's database question", "A strong password"],
        answer: 1,
        why: "The attacker's typing becomes part of the code." },
      { q: "Why does ' OR '1'='1 work on risky code?",
        options: ["It makes the question always true", "It deletes the website", "It guesses the password"],
        answer: 0,
        why: "'1'='1' is always true, so every user matches." },
      { q: "What's the fix?",
        options: ["Hide the login form", "Use placeholders (?) to keep user text separate", "Ask users to type carefully"],
        answer: 1,
        why: "Placeholders make the database treat input as plain data." }
    ]
  }
];
